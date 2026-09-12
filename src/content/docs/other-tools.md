---
title: Other tools
description: Continue, Aider, OpenClaw and any OpenAI-compatible interface.
order: 15
group: Set up your agent
---

# Other tools.

Anything that accepts an OpenAI base URL and an API key works with NaN. Here are the configurations for the tools that do not have a page of their own.

In all of them, the two values are the same:

| Field | Value |
|---|---|
| Base URL | `https://api.nan.builders/v1` |
| API key | your key, the one that starts with `sk-` |

## Continue

An extension for VS Code and JetBrains. Edit `~/.continue/config.yaml`:

```yaml
name: NaN
version: 1.0.0
schema: v1
models:
  - name: GLM 5.3 Flash
    provider: openai
    model: glm5.3-flash
    apiBase: https://api.nan.builders/v1
    apiKey: sk-your-key
    roles:
      - chat
      - edit
  - name: DeepSeek V4 Flash
    provider: openai
    model: deepseek-v4-flash
    apiBase: https://api.nan.builders/v1
    apiKey: sk-your-key
    roles:
      - chat
```

`provider: openai` does not mean it calls OpenAI: it is the name of the adapter that speaks that format. What decides where the request goes is `apiBase`.

## Aider

A terminal agent that works on your git repository. Aider routes by the model prefix, so the id has to be preceded by `openai/`:

```bash
export OPENAI_API_BASE="https://api.nan.builders/v1"
export OPENAI_API_KEY="sk-your-key"

aider --model openai/glm5.3-flash
```

To avoid repeating it every time, leave it in `~/.aider.conf.yml`:

```yaml
openai-api-base: https://api.nan.builders/v1
model: openai/glm5.3-flash
```

Without the `openai/` prefix, Aider tries to guess the provider from the name, does not recognize it, and fails before even making the request.

## Pi

It has a page of its own: [Pi](/docs/pi).

## OpenClaw

Configure `~/.openclaw/openclaw.json`:

```json
{
  "models": {
    "providers": {
      "nan": {
        "baseUrl": "https://api.nan.builders/v1",
        "apiKey": "sk-your-key",
        "api": "openai-completions",
        "models": [
          {
            "id": "glm5.3-flash",
            "name": "GLM 5.3 Flash",
            "reasoning": true,
            "input": ["text", "image"],
            "contextWindow": 1000000,
            "maxTokens": 65536
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "nan/glm5.3-flash" },
      "models": {
        "nan/glm5.3-flash": {
          "params": { "maxTokens": 16000 }
        }
      }
    }
  }
}
```

`maxTokens: 65536` is the maximum the model takes. `params.maxTokens: 16000` is what gets sent on each request, which is a good balance for most tasks. If you need longer answers, raise it, but bear in mind that reasoning comes out of that budget too.

## Open WebUI, LM Studio and other chat interfaces

They all ask for the same thing, under different names depending on the application: an OpenAI API address and a key.

- **Open WebUI**: Settings, Connections, OpenAI API. Put the base URL and the key, and the models show up in the picker on their own.
- **LM Studio**: in the remote providers tab, add an OpenAI-compatible provider with those same two values.

If the application asks you for "OpenAI API Base", "API Endpoint" or "Custom base URL", they are all the same field and they all want `https://api.nan.builders/v1`.

## Your own code

You do not need any tool at all: the official OpenAI SDK, in Python or in JavaScript, works by changing its base URL. It is in [Getting started](/docs/getting-started), with more examples in [Examples](/docs/examples).
