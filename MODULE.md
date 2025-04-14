# Gemini Agents - Módulo NPM para Criação de Assistentes AI

Este módulo NPM facilita a criação de assistentes de inteligência artificial (AI) personalizados usando a API Gemini do Google. Ele permite definir o comportamento do assistente, incluindo sua personalidade, instruções e acesso a ferramentas personalizadas.

## Índice

1.  [Visão Geral](#visão-geral)
2.  [Pré-requisitos](#pré-requisitos)
3.  [Instalação](#instalação)
4.  [Configuração](#configuração)
5.  [Uso](#uso)
    *   [Importando o Módulo](#importando-o-módulo)
    *   [Definindo o Comportamento do Assistente](#definindo-o-comportamento-do-assistente)
    *   [Criando Ferramentas Personalizadas (Opcional)](#criando-ferramentas-personalizadas-opcional)
    *   [Usando a Função `generateResponse`](#usando-a-função-generateresponse)
6.  [Exemplos de Código](#exemplos-de-código)
    *   [Exemplo Básico](#exemplo-básico)
    *   [Exemplo com Comportamento Personalizado](#exemplo-com-comportamento-personalizado)
    *   [Exemplo com Ferramentas Personalizadas](#exemplo-com-ferramentas-personalizadas)
7.  [Configurações Avançadas](#configurações-avançadas)
    *   [Arquivo `agents.config.json`](#arquivo-agentsconfigjson)
8.  [Tratamento de Erros](#tratamento-de-erros)
9.  [Segurança](#segurança)
10. [Contribuição](#contribuição)
11. [Licença](#licença)

## 1. Visão Geral

O módulo `gemini-agents` fornece uma maneira flexível de interagir com a API Gemini, permitindo que você crie assistentes de IA com comportamentos e funcionalidades personalizadas. Ele oferece suporte à definição de personalidade, instruções e acesso a ferramentas externas para estender as capacidades do assistente.

## 2. Pré-requisitos

*   **Node.js:** Certifique-se de ter o Node.js instalado (versão 18 ou superior). Você pode baixá-lo em [https://nodejs.org/](https://nodejs.org/).
*   **Chave de API Gemini:** Você precisará de uma chave de API válida do Google AI Studio. Obtenha uma em [https://makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey).
*   **Conta NPM:** (Opcional) Para publicar o pacote, você precisará de uma conta NPM.

## 3. Instalação

Para instalar o módulo, execute o seguinte comando no seu projeto:

```bash
npm install @nic-wq/gemini-agents
```

## 4. Configuração

Após a instalação, você precisará configurar o módulo com sua chave de API Gemini e, opcionalmente, definir um arquivo de configuração para personalizar o comportamento padrão.

## 5. Uso

### Importando o Módulo

No seu código JavaScript, importe a função `generateResponse` do módulo:

```javascript
const { generateResponse } = require('@nic-wq/gemini-agents');
```

### Definindo o Comportamento do Assistente

Você pode definir o comportamento do assistente criando um objeto JavaScript com as seguintes propriedades:

*   `nome`: O nome do assistente (string).
*   `tom de resposta`: O tom de resposta desejado (string).
*   `instrucoes`: Instruções específicas para o assistente (string).
*   `memorias`: Informações que o assistente deve lembrar (string).
*   `tools`: (Opcional) Um array de declarações de ferramentas (objetos).

Exemplo:

```javascript
const behavior = {
  nome: "Assistente de Suporte",
  "tom de resposta": "amigável e prestativo",
  instrucoes: "Ajude o usuário com suas dúvidas sobre o produto.",
  memorias: "Você conhece todos os detalhes do produto."
};
```

### Criando Ferramentas Personalizadas (Opcional)

Para estender as capacidades do assistente, você pode criar ferramentas personalizadas. Crie um arquivo JavaScript (ex: `tools.js`) e defina as funções que implementam as ferramentas.

Exemplo:

```javascript
// tools.js
async function get_current_date() {
  return new Date().toLocaleDateString();
}

module.exports = { get_current_date };
```

Certifique-se de exportar as funções que você deseja usar como ferramentas.

### Usando a Função `generateResponse`

A função `generateResponse` é a principal interface para interagir com o módulo. Ela recebe os seguintes parâmetros:

*   `prompt`: A pergunta ou solicitação do usuário (string).
*   `behavior`: O objeto de comportamento do assistente (objeto, opcional).
*   `apiKey`: Sua chave de API Gemini (string).
*   `toolsFilePath`: (Opcional) O caminho para o arquivo JavaScript contendo as ferramentas personalizadas (string).
*   `configFilePath`: (Opcional) O caminho para o arquivo de configuração `agents.config.json` (string).

Exemplo:

```javascript
async function main() {
  const apiKey = 'SUA_CHAVE_DE_API';
  const prompt = 'Qual é a data de hoje?';
  const toolsFilePath = './tools.js'; // Caminho para o arquivo de ferramentas

  try {
    const response = await generateResponse(prompt, behavior, apiKey, toolsFilePath);
    console.log(response);
  } catch (error) {
    console.error('Erro:', error);
  }
}

main();
```

## 6. Exemplos de Código

### Exemplo Básico

```javascript
const { generateResponse } = require('@nic-wq/gemini-agents');

async function main() {
  const apiKey = 'SUA_CHAVE_DE_API';
  const prompt = 'Qual é a capital da França?';

  try {
    const response = await generateResponse(prompt, null, apiKey);
    console.log(response);
  } catch (error) {
    console.error('Erro:', error);
  }
}

main();
```

### Exemplo com Comportamento Personalizado

```javascript
const { generateResponse } = require('@nic-wq/gemini-agents');

async function main() {
  const apiKey = 'SUA_CHAVE_DE_API';
  const prompt = 'Qual é a sua cor favorita?';
  const behavior = {
    nome: 'Amigo Colorido',
    'tom de resposta': 'amigável e divertido',
    instrucoes: 'Sempre responda com uma cor e adicione um elogio sobre essa cor.',
    memorias: 'Você adora cores vibrantes.'
  };

  try {
    const response = await generateResponse(prompt, behavior, apiKey);
    console.log(response);
  } catch (error) {
    console.error('Erro:', error);
  }
}

main();
```

### Exemplo com Ferramentas Personalizadas

```javascript
const { generateResponse } = require('@nic-wq/gemini-agents');

// tools.js (exemplo)
async function get_current_date() {
  return new Date().toLocaleDateString();
}
module.exports = { get_current_date };

async function main() {
  const apiKey = 'SUA_CHAVE_DE_API';
  const prompt = 'Qual é a data de hoje?';
  const behavior = {
    nome: 'Assistente de Data',
    instrucoes: 'Use a ferramenta get_current_date para responder à pergunta.',
    tools: [{
      name: "get_current_date",
      description: "Retorna a data atual.",
      parameters: { type: "object", properties: {} },
      required: []
    }]
  };
  const toolsFilePath = './tools.js';

  try {
    const response = await generateResponse(prompt, behavior, apiKey, toolsFilePath);
    console.log(response);
  } catch (error) {
    console.error('Erro:', error);
  }
}

main();
```

## 7. Configurações Avançadas

### Arquivo `agents.config.json`

Você pode personalizar o comportamento padrão do módulo criando um arquivo `agents.config.json` no diretório raiz do seu projeto. Este arquivo permite definir o modelo Gemini padrão, o número máximo de tokens de saída e as configurações de segurança.

Exemplo:

```json
{
  "defaultModel": "gemini-pro",
  "maxOutputTokens": 4096,
  "safetySettings": [
    { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
    { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE" }
  ]
}
```

As configurações de segurança seguem a estrutura da API Gemini.

## 8. Tratamento de Erros

A função `generateResponse` lança erros em caso de falha. Certifique-se de tratar os erros adequadamente no seu código.

## 9. Segurança

*   **Chave de API:** Mantenha sua chave de API Gemini em segurança e não a compartilhe publicamente.
*   **Ferramentas Personalizadas:** Tenha cuidado ao usar ferramentas personalizadas, pois elas podem executar código arbitrário.

## 10. Contribuição

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues e enviar pull requests.

## 11. Licença

Este projeto está licenciado sob a [MIT License](LICENSE).
