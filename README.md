
# Gemini Agents

## First Steps

Download the file index.js, and run the command:

```
node index.js

```

The chat will initialize and you can ask Gemini to do something, like:

-   Create a list of items to buy with: tomatoes, bananas, soap, pumpkin

Or

-   Create a basic site of checklists

The context model decides what file the programmer needs (programmer will be renamed to agent soon) to complete your task, then the programmer will use tools to create and modify files in the gemini_files folder.

Gemini can ONLY modify and create files in the folder gemini_files, or you can rename the folder in config.json:

```json
{
  "gemini_programmer_api_key": "PROGRAMMER_KEY",
  "gemini_context_api_key": "CONTEXT_KEY",
  "programmer_model_name": "gemini-2.0-flash",
  "context_model_name": "gemini-2.0-flash",
  "gemini_files_directory": "./gemini_files", // here you can rename
  "max_output_tokens": 8192,
  "server_port": 3000
}

```

## Configuring and Personalizing Gemini Agents

To configure your agent you can modify:

-   `gemini_programmer_api_key`: the Gemini API key that the programmer will use
-   `gemini_context_api_key`: the Gemini API key that the context model will use
-   `programmer_model_name`: the Gemini model that the programmer will use (for simple tasks: gemini-2.0-flash, for advanced tasks: gemini-2.5-pro-exp-03-25)
-   `context_model_name`: the Gemini model that the context model will use (recommended: gemini-2.0-flash)
-   `gemini_files_directory`: the folder that Gemini can read and write
-   `max_output_tokens`: the maximum number of tokens in the response, check the Gemini documentation, recommended: 8192
-   `server_port`: the port that the server (if you use the server) runs on; if you don't use server, remove this

## Setup Server

Server is an advanced feature. If you want to use Gemini Agents in a web interface, use server and send a GET request to the port that you set, like:

```
GET localhost:3000/chat?message=Create%20a%20text.txt%20with%20the%20content%20hello%20world

```

The WebUI is coming soon to this repo.
