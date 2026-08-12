---
title: Primeros pasos
description: Configura tu IDE o herramienta favorita para conectarte a los modelos de NaN.
order: 1
group: Primeros pasos
---

# Primeros pasos.

El acceso es vía LiteLLM con una API compatible con OpenAI. Funciona con cualquier herramienta que acepte una `base URL` y una `API key`: Cursor, Cline, Continue, Aider, Open Code, Open WebUI o cualquier SDK compatible con OpenAI.

## Consigue tu API Key

Tienes que ser miembro de la comunidad de NaN. Si ya estás suscrito, genera tu API Key desde los ajustes de usuario, en el apartado "API Keys" de la [plataforma](https://cloud.nan.builders/). La key es personal e intransferible.

> **Nota**
> El soporte es solo para incidencias técnicas.

## Configura tu herramienta

| Campo | Valor |
|---|---|
| base URL | `https://api.nan.builders/v1` |
| API Key | `sk-your-key-here` |
| Modelo | `qwen3.6` |

Ejemplo de configuración compatible con OpenAI:

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
