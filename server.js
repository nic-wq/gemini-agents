// server.js (Versão: Web Server com GET endpoint)
// Importa as bibliotecas necessárias
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
const express = require('express'); // Importa o Express

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
const PORT = config.server_port || 3000; // Define a porta para o servidor

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

// --- Implementação das Funções de Apoio e Ferramentas (IDÊNTICAS AO ORIGINAL) ---

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


// --- Definição das Ferramentas para cada Modelo (IDÊNTICAS AO ORIGINAL) ---

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
                    items: { type: "string" }
                }
            },
            required: ["file_name"]
        }
    }]
}];

const tools_programador = [{
    functionDeclarations: [
        {
            name: "create_file",
            description: "Cria um novo arquivo com nome e conteúdo especificados.",
            parameters: {
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
            parameters: {
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

// --- Inicialização dos Clientes Gemini (IDÊNTICO AO ORIGINAL) ---

const genAIProgrammer = new GoogleGenerativeAI(config.gemini_programmer_api_key);
const genAIContext = new GoogleGenerativeAI(config.gemini_context_api_key);

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    // ... (outras categorias como no original)
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

const generationConfig = {
    maxOutputTokens: config.max_output_tokens || 2048,
};

const modelContexto = genAIContext.getGenerativeModel({
    model: config.context_model_name,
    tools: tools_contexto,
    safetySettings: safetySettings,
    generationConfig: generationConfig
});

const modelProgramador = genAIProgrammer.getGenerativeModel({
    model: config.programmer_model_name,
    tools: tools_programador,
    safetySettings: safetySettings,
    generationConfig: generationConfig
});

// --- Inicialização do Chat do Programador (Fora do manipulador de requisição) ---
const chatProgramador = modelProgramador.startChat({
    history: [
        { role: "user", parts: [{ text: `Você é um assistente de programação AI. Você pode criar e modificar arquivos no diretório '${GEMINI_FILES_DIR}'. O contexto relevante dos arquivos existentes será fornecido quando necessário. Use as ferramentas 'create_file' e 'modify_file' para completar as tarefas.` }] },
        { role: "model", parts: [{ text: "Entendido. Estou pronto para programar. Receberei o contexto necessário e usarei as ferramentas para criar ou modificar arquivos conforme solicitado. Como posso ajudar?" }] },
    ],
});
console.log("Chat do Programador inicializado e pronto para receber requisições.");


// --- Configuração do Servidor Express ---
const app = express();
app.use(express.json()); // Para parsear JSON no corpo de requisições (embora usemos GET aqui)

// --- Endpoint GET /chat ---
app.get('/chat', async (req, res) => {
    const userMessage = req.query.message; // Pega a mensagem do parâmetro 'message' da URL

    if (!userMessage) {
        return res.status(400).json({
            status: "error",
            message: "Parâmetro 'message' não encontrado na query string."
        });
    }

    console.log(`\n--- Nova Requisição Recebida ---`);
    console.log(`Você (via GET): ${userMessage}`);

    // Variáveis para armazenar os resultados para a resposta JSON
    let programmerTextOutput = "";
    let toolExecutionResults = [];
    let orchestratorMessagesForClient = []; // Mensagens específicas para o cliente
    let errorOccurred = false;
    let errorMessage = "";
    let errorDetails = null;


    try {
        // --- Etapa 1: Consultando Modelo de Contexto ---
        console.log("--- Etapa 1: Consultando Modelo de Contexto ---");
        orchestratorMessagesForClient.push("Consultando modelo de contexto...");

        const currentFiles = await listFilesInternal();
        const fileListString = currentFiles.length > 0 ? currentFiles.join(', ') : 'Nenhum arquivo encontrado.';
        console.log(`[Orchestrator] Arquivos atuais: ${fileListString}`);

        const promptContexto = `Analisando a solicitação do usuário: "${userMessage}".\nOs arquivos existentes no diretório são: [${fileListString}].\nQuais desses arquivos são relevantes para fornecer contexto? Se algum for relevante, use a ferramenta 'get_context_from_file' para obter o conteúdo APENAS dos arquivos relevantes. Se nenhum for relevante ou nenhum existir, responda apenas com "Nenhum contexto necessário."`;

        let structuredContextResult = null;
        const resultContexto = await modelContexto.generateContent([promptContexto]);
        const functionCallsContexto = resultContexto.response.functionCalls();

        if (functionCallsContexto && functionCallsContexto.length > 0) {
            const call = functionCallsContexto[0];
            if (call.name === 'get_context_from_file') {
                const filesToGet = call.args.file_name;
                console.log(`[Contexto] Solicitou contexto para: ${filesToGet.join(', ')}`);
                orchestratorMessagesForClient.push(`Contexto solicitado para: ${filesToGet.join(', ')}`);
                structuredContextResult = await getContextFromFile(filesToGet);
                console.log("[Orchestrator] Contexto obtido.");
                orchestratorMessagesForClient.push("Contexto obtido.");
            } else {
                console.warn(`[Contexto] Chamou função inesperada: ${call.name}`);
                orchestratorMessagesForClient.push(`Contexto chamou função inesperada: ${call.name}`);
            }
        } else {
            console.log("[Contexto] Decidiu não chamar get_context_from_file:", resultContexto.response.text());
            orchestratorMessagesForClient.push("Modelo de contexto decidiu não buscar conteúdo de arquivos.");
        }

        // --- Etapa 2: Formatar Conteúdo (se obtido) ---
        let formattedContext = "";
        if (structuredContextResult) {
            console.log("--- Etapa 2: Formatando Conteúdo Obtido ---");
            formattedContext = formatContextForProgrammer(structuredContextResult);
            console.log("[Orchestrator] Contexto formatado para o Programador.");
            orchestratorMessagesForClient.push("Contexto formatado.");
        } else {
            console.log("--- Etapa 2: Nenhum contexto foi solicitado ou obtido ---");
             orchestratorMessagesForClient.push("Nenhum contexto adicional obtido.");
        }

        // --- Etapa 3: Chamada ao Modelo Programador ---
        console.log("--- Etapa 3: Consultando Modelo Programador ---");
        orchestratorMessagesForClient.push("Consultando modelo programador...");

        const promptProgramador = `${userMessage}${formattedContext ? `\n\n### Contexto dos Arquivos Relevantes ###\n${formattedContext}\n### Fim do Contexto ###` : ''}`;
        console.log("Enviando para o Programador...");

        // Usa o chatProgramador PAI (definido fora do handler) para manter o histórico
        const resultProgramador = await chatProgramador.sendMessage(promptProgramador);
        const responseProgramador = resultProgramador.response;

        const functionCallsProgramador = responseProgramador.functionCalls();
        const textResponseProgramador = responseProgramador.text();

        // --- Etapa 4: Executar Ação do Programador ou Preparar Resposta de Texto ---
         console.log("--- Etapa 4: Processando resposta do Programador ---");

        if (functionCallsProgramador && functionCallsProgramador.length > 0) {
            console.log(`[Programador] Solicitou chamada de função: ${functionCallsProgramador.map(fc => fc.name).join(', ')}`);
            orchestratorMessagesForClient.push(`Programador solicitou ação: ${functionCallsProgramador.map(fc => fc.name).join(', ')}`);

            for (const call of functionCallsProgramador) {
                const { name, args } = call;
                let functionResult = "Erro: Função não reconhecida.";
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
                console.log(`[Orquestrador] Resultado da ação: ${functionResult}`);
                toolExecutionResults.push(functionResult); // Adiciona ao array de resultados
            }
            // Não há mais interação com a IA nesta rodada após executar a ferramenta

        } else if (textResponseProgramador) {
            console.log('Gemini (Programador) respondeu com texto.');
            programmerTextOutput = textResponseProgramador; // Armazena para a resposta JSON
            orchestratorMessagesForClient.push("Programador respondeu com texto.");
        } else {
            console.log('[Orquestrador] O Programador não forneceu texto nem solicitou ação.');
             orchestratorMessagesForClient.push("Programador não retornou texto ou ação.");
        }

    } catch (error) {
        console.error("\nErro no fluxo do endpoint /chat:", error);
         errorOccurred = true;
        errorMessage = "Erro durante o processamento do chat.";
        errorDetails = error.message || "Erro desconhecido";

        // Adiciona detalhes específicos do erro, se disponíveis
        if (error instanceof Error && error.message.includes('GoogleGenerativeAIError')) {
             console.error("Detalhes do Erro da API:", error);
             errorMessage = "Erro na comunicação com a API Gemini.";
             errorDetails = error.message;
         } else if (error.response && error.response.promptFeedback) {
            console.error("Feedback do Prompt:", error.response.promptFeedback);
            errorMessage = "Erro devido ao feedback do prompt (possível bloqueio de segurança).";
            errorDetails = JSON.stringify(error.response.promptFeedback);
        } else if (error.message && error.message.includes("429")) {
            console.error("Erro: Limite de taxa da API atingido.");
             errorMessage = "Limite de taxa da API atingido.";
             errorDetails = "Tente novamente mais tarde.";
         } else if (error.message && error.message.includes("JSON")) {
             console.error("Erro: Problema ao processar JSON.");
              errorMessage = "Erro ao processar JSON da API ou ferramenta.";
              errorDetails = error.message;
         }
    }

    // --- Envio da Resposta JSON ---
    if (errorOccurred) {
        res.status(500).json({
            status: "error",
            message: errorMessage,
            details: errorDetails,
            orchestratorMessages: orchestratorMessagesForClient // Inclui mensagens do orquestrador mesmo em erro
        });
    } else {
        res.json({
            status: "success",
            programmerResponse: programmerTextOutput, // Texto direto do programador
            toolResults: toolExecutionResults,        // Resultados das ferramentas executadas
            orchestratorMessages: orchestratorMessagesForClient // Mensagens sobre o fluxo
        });
    }
});

// --- Rota Padrão (Opcional) ---
app.get('/', (req, res) => {
    res.send('Servidor Gemini Chat está rodando. Use o endpoint GET /chat?message=SUA_MENSAGEM');
});

// --- Inicia o Servidor ---
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Diretório de arquivos: ${GEMINI_FILES_DIR}`);
    console.log(`Para interagir, acesse via GET: http://localhost:${PORT}/chat?message=SUA_MENSAGEM_AQUI`);
});