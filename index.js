const { loadBehavior } = require('./behaviorLoader');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai"); // Importa do SDK

/**
 * Gera uma resposta usando o modelo Gemini, suportando comportamento e ferramentas personalizadas.
 * @param {string} prompt Prompt do usuário.
 * @param {object|null} behavior Objeto de comportamento do assistente.
 * @param {string} apiKey Chave de API do Google AI Studio.
 * @param {string} [toolsFilePath] Caminho opcional para o arquivo .js contendo as implementações das ferramentas.
 * @param {string} [configFilePath] Caminho opcional para o arquivo de configuração agents.config.json.
 * @returns {Promise<string>} A resposta final em texto do modelo.
 */
async function generateResponse(prompt, behavior, apiKey, toolsFilePath, configFilePath) {
  if (!apiKey) throw new Error("API Key é obrigatória.");
  if (!prompt) throw new Error("Prompt é obrigatório.");

  let behaviorData = null;
  let loadedTools = null;
  let functionDeclarations = null;
  let agentConfig = { // Define um objeto padrão
      defaultModel: "gemini-pro",
      maxOutputTokens: 2048,
      safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
      ]
  };

  try {
    // 0. Carrega as configurações do arquivo agents.config.json (se fornecido)
    if (configFilePath) {
        try {
            agentConfig = require(configFilePath);
            console.log(`[AgentConfig] Configurações carregadas de: ${configFilePath}`);
        } catch (configError) {
            console.warn(`[AgentConfig] Falha ao carregar arquivo de configuração: ${configError.message}. Usando configurações padrão.`);
            // Mantém as configurações padrão já definidas
        }
    } else {
        console.log("[AgentConfig] Nenhum arquivo de configuração fornecido. Usando configurações padrão.");
    }

    // 1. Carrega comportamento e ferramentas (se aplicável)
    if (behavior) {
      behaviorData = await loadBehavior(behavior, toolsFilePath);
      loadedTools = behaviorData?.loadedTools;
      // Usa as declarações do JSON de comportamento
      functionDeclarations = behaviorData?.tools?.length > 0 ? behaviorData.tools : null;
    }

    // 2. Constrói o prompt inicial com instruções de comportamento
    let systemInstructions = [];
    if (behaviorData?.nome) systemInstructions.push(`Você é ${behaviorData.nome}.`);
    if (behaviorData?.instrucoes) systemInstructions.push(`Siga estas instruções: ${behaviorData.instrucoes}`);
    if (behaviorData?.['tom de resposta']) systemInstructions.push(`Responda em um tom ${behaviorData['tom de resposta']}.`);
    if (behaviorData?.memorias) systemInstructions.push(`Lembre-se disso: ${behaviorData.memorias}`);

    const initialPromptParts = [];
    if (systemInstructions.length > 0) {
        // Adiciona instruções como uma mensagem separada ou prefixo
         initialPromptParts.push({ text: systemInstructions.join('\n') + "\n---" });
    }
     initialPromptParts.push({ text: prompt }); // Adiciona o prompt do usuário


    // 3. Inicializa o cliente e o modelo Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: agentConfig.defaultModel, // Usa o modelo padrão do arquivo de configuração
      // Passa as declarações de ferramentas se existirem
      tools: functionDeclarations ? [{ functionDeclarations }] : undefined,
      safetySettings: agentConfig.safetySettings.map(s => ({ // Usa safety settings do config
          category: HarmCategory[s.category], // Converte string para enum
          threshold: HarmBlockThreshold[s.threshold] // Converte string para enum
      })),
      generationConfig: {
          maxOutputTokens: agentConfig.maxOutputTokens, // Usa maxOutputTokens do config
      }
    });

    // 4. Inicia o chat (sem histórico prévio neste exemplo simples)
    const chat = model.startChat(); // Começa um novo chat para cada chamada

    // 5. Envia a mensagem inicial (prompt + instruções)
    console.log("[Request AI] Enviando prompt inicial...");
    let result = await chat.sendMessage(initialPromptParts);
    let response = result.response;
    let functionCall = response.functionCalls()?.[0];

    // 6. Loop de chamada de função
    while (functionCall) {
      const { name, args } = functionCall;
      console.log(`[Response AI] Solicitou chamada de função: ${name}`);

      // Verifica se a ferramenta está carregada
      const toolFunction = loadedTools?.[name];
      if (!toolFunction) {
        console.error(`[Tool Error] Função "${name}" solicitada pela IA, mas não encontrada em ${toolsFilePath || 'nenhum arquivo de ferramentas fornecido'}.`);
        // Decide como lidar: retornar erro ou tentar responder sem a ferramenta?
        // Retornar erro é mais seguro.
        throw new Error(`Ferramenta "${name}" não encontrada ou não carregada.`);
      }

      // Executa a função da ferramenta
      let toolResultContent;
      try {
        console.log(`[Tool Execution] Executando: ${name} com args:`, args);
        // Chama a função do usuário (pode ser async)
        const rawToolResult = await toolFunction(args);
        console.log(`[Tool Execution] Resultado bruto:`, rawToolResult);
        // O conteúdo a ser enviado de volta é o resultado bruto da função
        toolResultContent = rawToolResult;
      } catch (toolError) {
        console.error(`[Tool Execution Error] Erro na ferramenta ${name}:`, toolError);
        // Informa a IA sobre o erro
        toolResultContent = { error: `Erro ao executar a ferramenta ${name}: ${toolError.message}` };
      }

      // Envia o resultado da função de volta para a IA
      console.log(`[Request AI] Enviando resultado da ferramenta ${name} de volta...`);
      result = await chat.sendMessage([
        { // Envia a resposta da função como uma FunctionResponsePart
          functionResponse: {
            name: name,
            response: {
              // A API espera o 'name' aqui também, e 'content' com o resultado
              name: name,
              content: toolResultContent,
            },
          },
        },
      ]);
      response = result.response;

      // Verifica se a nova resposta contém outra chamada de função
      functionCall = response.functionCalls()?.[0];
    }

    // 7. Retorna a resposta final em texto
    const finalText = response.text();
    console.log("[Response AI] Resposta final em texto:", finalText);
    return finalText;

  } catch (error) {
    console.error("Erro detalhado em generateResponse:", error);
    // Melhora o tratamento de erro para incluir mais contexto
    let errorMessage = `Falha ao gerar resposta: ${error.message || 'Erro desconhecido'}`;
    if (error instanceof Error && error.message.startsWith('HTTP error!')) {
        errorMessage = `Falha ao se comunicar com a API do Gemini. ${error.message}`;
    } else if (error instanceof Error && error.message.includes('Não foi possível carregar')) {
         errorMessage = error.message; // Erro do behaviorLoader
    } else if (error instanceof Error && error.message.includes('Resposta da API inesperada ou bloqueada')) {
         errorMessage = `Falha ao processar resposta da API. ${error.message}`;
    } else if (error.response?.promptFeedback) {
         errorMessage = `Requisição bloqueada pela API Gemini. Razão: ${error.response.promptFeedback.blockReason || 'Desconhecida'}. Detalhes: ${JSON.stringify(error.response.promptFeedback)}`;
    } else if (error.message?.includes('429')) {
         errorMessage = `Limite de taxa da API Gemini atingido. Tente novamente mais tarde.`;
    }
    // Lança um novo erro com a mensagem formatada
    throw new Error(errorMessage);
  }
}

module.exports = { generateResponse };
