const path = require('path'); // Necessário para resolver o caminho

async function loadBehavior(behaviorInput, toolsFilePath) { // Adiciona toolsFilePath
  if (!behaviorInput) {
    return null; // Nenhum comportamento fornecido
  }

  let behaviorData;

  if (typeof behaviorInput === 'object' && behaviorInput !== null) {
    // Usar objeto diretamente
    behaviorData = { ...behaviorInput }; // Clona o objeto para evitar mutação
  } else {
    throw new Error('Formato de comportamento inválido. Forneça um objeto.');
  }

  // Validação básica (opcional, pode ser expandida)
  if (!behaviorData.instrucoes) {
      console.warn("Aviso: O comportamento carregado não possui 'instrucoes'.");
  }

  // Carrega as ferramentas se o caminho for fornecido e o comportamento as definir
  if (toolsFilePath && behaviorData.tools && behaviorData.tools.length > 0) {
    try {
      // Resolve o caminho absoluto para garantir que o require funcione corretamente
      const absoluteToolsPath = path.resolve(toolsFilePath);
      console.log(`[BehaviorLoader] Tentando carregar ferramentas de: ${absoluteToolsPath}`);
      // Carrega as funções exportadas do arquivo do usuário
      behaviorData.loadedTools = require(absoluteToolsPath);
      console.log(`[BehaviorLoader] Ferramentas carregadas com sucesso.`);

      // Validação básica: verifica se as funções declaradas existem no arquivo carregado
      for (const toolDecl of behaviorData.tools) {
          if (typeof behaviorData.loadedTools?.[toolDecl.name] !== 'function') {
              console.warn(`[BehaviorLoader] Aviso: A função da ferramenta "${toolDecl.name}" declarada no comportamento não foi encontrada ou não é uma função no arquivo ${toolsFilePath}.`);
          }
      }

    } catch (error) {
      console.error(`[BehaviorLoader] Erro ao carregar o arquivo de ferramentas (${toolsFilePath}):`, error);
      // Decide se quer lançar um erro ou apenas avisar e continuar sem ferramentas
      // Lançar erro é mais seguro para evitar comportamento inesperado.
      throw new Error(`Não foi possível carregar o arquivo de ferramentas: ${toolsFilePath}. Verifique o caminho e o conteúdo do arquivo.`);
    }
  } else if (behaviorData.tools && behaviorData.tools.length > 0 && !toolsFilePath) {
      console.warn("[BehaviorLoader] Aviso: O comportamento define ferramentas, mas nenhum 'toolsFilePath' foi fornecido.");
  }

  return behaviorData;
}

module.exports = { loadBehavior };
