---
title: Getting Started
description: Configure your favorite IDE or tool to connect to NaN models.
order: 1
---

# Getting Started.

Access is via LiteLLM with an OpenAI-compatible API. Works with any tool that accepts a `base URL` + `API key`: Cursor, Cline, Continue, Aider, Open Code, Open WebUI, or any OpenAI-compatible SDK.

## Get your API Key

You must be a NaN community member. If you're already subscribed, generate your API Key from the user settings section under "API Keys" on the [platform](https://cloud.nan.builders/). The key is personal and non-transferable.

> **Note**
> Support is for technical issues only.

## Configure your tool

| Field | Value |
|---|---|
| base URL | `https://api.nan.builders/v1` |
| API Key | `sk-your-key-here` |
| Model | `qwen3.6` |

OpenAI-compatible configuration example:

```json
provider: {
  openai: {
    npm: "@ai-sdk/openai",
    name: "NaN",
    apiKey: "sk-your-key-here",
    baseURL: "https://api.nan.builders/v1",
    model: "qwen3.6"
  }
}
```
