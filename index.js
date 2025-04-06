// index.js (Versão: Sem loop de resposta para Programador)
// Importa as bibliotecas necessárias
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

// --- Carregamento da Configuração ---
let config;
try {
  config = require('./config.json');
} catch (error) {
  console.error("Erro: Falha ao carregar o arquivo config.json.", error);
  console.log("Certifique-se de que o arquivo config.json existe no mesmo diretório e tem o formato correto.");
  process.exit(1);
}

// Validação das configurações (simplificada)
if (!config.gemini_programmer_api_key || !config.gemini_context_api_key ||
    config.gemini_programmer_api_key.startsWith("SUA_API_KEY") ||
    config.gemini_context_api_key.startsWith("SUA_API_KEY")) {
    console.error("Erro: API Keys não configuradas corretamente em config.json.");
    process.exit(1);
}

const GEMINI_FILES_DIR = path.resolve(config.gemini_files_directory || './gemini_files');

// Cria o diretório se não existir
if (!fs.existsSync(GEMINI_FILES_DIR)) {
  try {
    fs.mkdirSync(GEMINI_FILES_DIR, { recursive: true });
    console.log(`Diretório criado: ${GEMINI_FILES_DIR}`);
  } catch (error) {
    console.error(`Erro ao criar o diretório ${GEMINI_FILES_DIR}:`, error);
    process.exit(1);
  }
} else {
    console.log(`Usando diretório existente: ${GEMINI_FILES_DIR}`);
}

// --- Implementação das Funções de Apoio e Ferramentas ---

// Função JS para listar arquivos (usada pelo Orquestrador)
async function listFilesInternal() {
    console.log(`[Orchestrator] Listando arquivos em: ${GEMINI_FILES_DIR}`);
    try {
        const files = await fs.promises.readdir(GEMINI_FILES_DIR);
        console.log(`[Orchestrator] Arquivos encontrados: ${files.length}`);
        return files; // Retorna array de nomes
    } catch (error) {
        console.error(`[Orchestrator] Erro ao listar arquivos:`, error);
        return []; // Retorna array vazio em caso de erro
    }
}

// Função para obter conteúdo (usada pelo Orquestrador ao responder à ferramenta do Contexto)
// Retorna um objeto estruturado { filename: content/error, ... }
async function getContextFromFile(fileNames) {
  if (!Array.isArray(fileNames)) {
      console.error("[Tool Error - Contexto] getContextFromFile chamado sem um array de nomes.");
      return { error: "Input inválido: file_name deve ser um array." };
  }
  console.log(`[Tool Call - Contexto] getContextFromFile chamado para: ${fileNames.join(', ')}`);
  const results = {};
  for (const fileName of fileNames) {
    const filePath = path.join(GEMINI_FILES_DIR, fileName);
    try {
      if (fileName.includes('..') || fileName.includes('/')) throw new Error("Nome de arquivo inválido.");
      if (!fs.existsSync(filePath)) throw new Error(`Arquivo "${fileName}" não encontrado.`);
      const content = await fs.promises.readFile(filePath, 'utf8');
      results[fileName] = content;
      console.log(`[Tool Success - Contexto] Contexto lido de: ${filePath}`);
    } catch (error) {
      console.error(`[Tool Error - Contexto] Erro ao ler ${filePath}:`, error);
      results[fileName] = `Erro ao ler o arquivo "${fileName}": ${error.message}`;
    }
  }
  return results;
}

// Função para formatar o contexto para o Programador
function formatContextForProgrammer(structuredContext) {
    if (!structuredContext || Object.keys(structuredContext).length === 0 || structuredContext.error) {
        return "";
    }
    let contextString = "";
    for (const [name, content] of Object.entries(structuredContext)) {
        if (!content.startsWith('Erro ao ler o arquivo')) {
             contextString += `\n--- Conteúdo de ${name} ---\n${content}\n--- Fim de ${name} ---\n`;
        } else {
             contextString += `\n--- Erro ao ler ${name}: ${content} ---\n`;
        }
    }
    return contextString.trim();
}


// Função para criar arquivo (usada pelo Programador)
async function createFile(fileName, fileContent) {
  const filePath = path.join(GEMINI_FILES_DIR, fileName);
  console.log(`[Tool Call - Programador] Tentando criar arquivo: ${filePath}`);
  try {
    if (fileName.includes('..') || fileName.includes('/')) throw new Error("Nome de arquivo inválido.");
    await fs.promises.writeFile(filePath, fileContent, 'utf8');
    const successMsg = `Arquivo "${fileName}" criado com sucesso.`;
    console.log(`[Tool Success - Programador] ${successMsg}`);
    return successMsg; // Retorna mensagem de sucesso
  } catch (error) {
    const errorMsg = `Erro ao criar o arquivo "${fileName}": ${error.message}`;
    console.error(`[Tool Error - Programador] ${errorMsg}`);
    return errorMsg; // Retorna mensagem de erro
  }
}

// Função para modificar arquivo (usada pelo Programador)
async function modifyFile(fileName, pieceToReplace, replaceWith) {
  const filePath = path.join(GEMINI_FILES_DIR, fileName);
  console.log(`[Tool Call - Programador] Tentando modificar arquivo: ${filePath}`);
  try {
    if (fileName.includes('..') || fileName.includes('/')) throw new Error("Nome de arquivo inválido.");
    if (!fs.existsSync(filePath)) throw new Error(`Arquivo "${fileName}" não encontrado.`);
    const currentContent = await fs.promises.readFile(filePath, 'utf8');
    if (!currentContent.includes(pieceToReplace)) {
      const warnMsg = `Atenção: O trecho "${pieceToReplace}" não foi encontrado em "${fileName}". Nenhuma modificação feita.`;
      console.warn(`[Tool Warning - Programador] ${warnMsg}`);
      return warnMsg;
    }
    const newContent = currentContent.replace(pieceToReplace, replaceWith);
    await fs.promises.writeFile(filePath, newContent, 'utf8');
    const successMsg = `Arquivo "${fileName}" modificado com sucesso.`;
    console.log(`[Tool Success - Programador] ${successMsg}`);
    return successMsg;
  } catch (error) {
    const errorMsg = `Erro ao modificar o arquivo "${fileName}": ${error.message}`;
    console.error(`[Tool Error - Programador] ${errorMsg}`);
    return errorMsg;
  }
}


// --- Definição das Ferramentas para cada Modelo ---

// Ferramentas para o Contexto (apenas get_context_from_file)
const tools_contexto = [{
  functionDeclarations: [{
    name: "get_context_from_file",
    description: "Obtém o conteúdo completo de um ou mais arquivos especificados pelo nome para análise ou contexto.",
    parameters: {
      type: "object",
      properties: {
        file_name: {
          type: "array",
          description: "Uma lista (array) de nomes de arquivos dos quais obter o conteúdo.",
          items: {
            type: "string"
          }
        }
      },
      required: ["file_name"]
    }
  }]
}];

// Ferramentas para o Programador (criar/modificar)
const tools_programador = [{
  functionDeclarations: [
    {
      name: "create_file",
      description: "Cria um novo arquivo com nome e conteúdo especificados.",
      parameters: { /* ... (igual antes) ... */
          type: "object",
          properties: {
            file_name: { type: "string", description: "O nome do arquivo a ser criado (ex: 'meuScript.js')." },
            file_content: { type: "string", description: "O conteúdo completo do novo arquivo." }
          },
          required: ["file_name", "file_content"]
      }
    },
    {
      name: "modify_file",
      description: "Modifica um arquivo existente substituindo um trecho específico por outro.",
      parameters: { /* ... (igual antes) ... */
          type: "object",
          properties: {
            file_name: { type: "string", description: "O nome do arquivo a ser modificado." },
            piece_to_replace: { type: "string", description: "O trecho exato a ser substituído." },
            replace_with: { type: "string", description: "O novo texto que substituirá o trecho." }
          },
          required: ["file_name", "piece_to_replace", "replace_with"]
      }
    }
  ]
}];

// --- Inicialização dos Clientes Gemini ---

const genAIProgrammer = new GoogleGenerativeAI(config.gemini_programmer_api_key);
const genAIContext = new GoogleGenerativeAI(config.gemini_context_api_key);

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

const generationConfig = {
    maxOutputTokens: config.max_output_tokens || 2048,
};

// Modelo de Contexto (com get_context_from_file)
const modelContexto = genAIContext.getGenerativeModel({
  model: config.context_model_name,
  tools: tools_contexto,
  safetySettings: safetySettings,
  generationConfig: generationConfig
});

// Modelo Programador (com criar/modificar)
const modelProgramador = genAIProgrammer.getGenerativeModel({
  model: config.programmer_model_name,
  tools: tools_programador,
  safetySettings: safetySettings,
  generationConfig: generationConfig
});


// --- Função Principal de Chat (Orquestração) ---
async function runChat() {
  // Chat principal com o Programador
  const chatProgramador = modelProgramador.startChat({
    history: [
         { role: "user", parts: [{ text: `Você é um assistente de programação AI. Você pode criar e modificar arquivos no diretório '${GEMINI_FILES_DIR}'. O contexto relevante dos arquivos existentes será fornecido quando necessário. Use as ferramentas 'create_file' e 'modify_file' para completar as tarefas.` }] },
         { role: "model", parts: [{ text: "Entendido. Estou pronto para programar. Receberei o contexto necessário e usarei as ferramentas para criar ou modificar arquivos conforme solicitado. Como posso ajudar?" }] },
    ],
  });

  console.log("Chat iniciado (Sem loop de resposta para Programador). Digite 'sair' para terminar.");

  askQuestion();

  async function askQuestion() {
    readline.question('Você: ', async (msg) => {
      if (msg.toLowerCase() === 'sair') {
        readline.close();
        console.log("Chat encerrado.");
        return;
      }

      try {
        console.log("\n--- Etapa 1: Consultando Modelo de Contexto ---");

        // 1a: Listar arquivos internamente
        const currentFiles = await listFilesInternal();
        const fileListString = currentFiles.length > 0 ? currentFiles.join(', ') : 'Nenhum arquivo encontrado.';
        console.log(`[Orchestrator] Arquivos atuais: ${fileListString}`);

        // 1b: Chamar Modelo de Contexto
        const promptContexto = `Analisando a solicitação do usuário: "${msg}".\nOs arquivos existentes no diretório são: [${fileListString}].\nQuais desses arquivos são relevantes para fornecer contexto? Se algum for relevante, use a ferramenta 'get_context_from_file' para obter o conteúdo APENAS dos arquivos relevantes. Se nenhum for relevante ou nenhum existir, responda apenas com "Nenhum contexto necessário."`;

        let structuredContextResult = null;

        const resultContexto = await modelContexto.generateContent([promptContexto]);

        const functionCallsContexto = resultContexto.response.functionCalls();

        if (functionCallsContexto && functionCallsContexto.length > 0) {
            const call = functionCallsContexto[0];
            if (call.name === 'get_context_from_file') {
                console.log(`[Contexto] Solicitou contexto para: ${call.args.file_name.join(', ')}`);
                // 1c: Executar a função e ARMAZENAR o resultado
                structuredContextResult = await getContextFromFile(call.args.file_name);
                console.log("[Orchestrator] Contexto obtido.");
                // 1d: Não fazer mais nada com o modelContexto
            } else {
                 console.warn(`[Contexto] Chamou função inesperada: ${call.name}`);
            }
        } else {
             console.log("[Contexto] Decidiu não chamar get_context_from_file:", resultContexto.response.text());
        }


        // --- Etapa 2: Formatar Conteúdo (se obtido) ---
        let formattedContext = "";
        if (structuredContextResult) {
            console.log("\n--- Etapa 2: Formatando Conteúdo Obtido ---");
            formattedContext = formatContextForProgrammer(structuredContextResult);
            console.log("[Orchestrator] Contexto formatado para o Programador.");
        } else {
            console.log("\n--- Etapa 2: Nenhum contexto foi solicitado ou obtido ---");
        }

        // --- Etapa 3: Chamada ao Modelo Programador ---
        console.log("\n--- Etapa 3: Consultando Modelo Programador ---");

        const promptProgramador = `${msg}${formattedContext ? `\n\n### Contexto dos Arquivos Relevantes ###\n${formattedContext}\n### Fim do Contexto ###` : ''}`;
        console.log("Enviando para o Programador...");


        const resultProgramador = await chatProgramador.sendMessage(promptProgramador);
        const responseProgramador = resultProgramador.response; // Acessa a resposta

        const functionCallsProgramador = responseProgramador.functionCalls();
        const textResponseProgramador = responseProgramador.text();

        // --- Etapa 4: Executar Ação do Programador (se houver) ou Mostrar Texto ---

        if (functionCallsProgramador && functionCallsProgramador.length > 0) {
            console.log(`[Programador] Solicitou chamada de função: ${functionCallsProgramador.map(fc => fc.name).join(', ')}`);

            // Executa a(s) função(ões) solicitada(s) - geralmente apenas uma
            for (const call of functionCallsProgramador) {
                const { name, args } = call;
                let functionResult = "Erro: Função não reconhecida."; // Mensagem padrão
                console.log(`  -> Executando ${name} com args:`, args);

                try {
                    if (name === 'create_file') {
                        functionResult = await createFile(args.file_name, args.file_content);
                    } else if (name === 'modify_file') {
                        functionResult = await modifyFile(args.file_name, args.piece_to_replace, args.replace_with);
                    } else {
                        console.warn(`[Programador] Função desconhecida chamada: ${name}`);
                        functionResult = `Erro: Função ${name} não implementada.`;
                    }
                } catch (error) {
                     console.error(`[Programador] Erro ao executar a função ${name}:`, error);
                     functionResult = `Erro interno ao executar ${name}: ${error.message}`;
                }

                // Informa diretamente ao usuário o resultado da execução da ferramenta
                console.log(`\n[Orquestrador] Resultado da ação solicitada pela IA: ${functionResult}`);
            }
            // Não envia nada de volta para a API nem espera outra resposta dela nesta rodada.

        } else if (textResponseProgramador) {
            // Se não houve chamada de função, apenas mostra a resposta de texto do Programador
            console.log('\nGemini (Programador):', textResponseProgramador);
        } else {
            // Caso raro: sem texto e sem função
             console.log('\n[Orquestrador] O Programador não forneceu texto nem solicitou ação.');
        }

      } catch (error) {
        console.error("\nErro no fluxo principal do chat:", error);
        if (error instanceof Error && error.message.includes('GoogleGenerativeAIError')) {
             console.error("Detalhes do Erro da API:", error);
         } else if (error.response && error.response.promptFeedback) {
            console.error("Feedback do Prompt:", error.response.promptFeedback);
        } else if (error.message && error.message.includes("429")) {
            console.error("Erro: Limite de taxa da API atingido. Espere um pouco antes de tentar novamente.");
         } else if (error.message && error.message.includes("JSON")) {
             console.error("Erro: Problema ao processar JSON. Verifique a resposta do modelo ou da ferramenta.");
         }
      }

      askQuestion(); // Pergunta novamente
    });
  }
}

// Inicia o chat
runChat();
