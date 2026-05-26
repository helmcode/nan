---
title: Empezar
description: Configura tu IDE o herramienta favorita para conectar a los modelos de NaN.
order: 1
---

# Conectarse.

El acceso es vía LiteLLM con una API compatible con OpenAI. Funciona con cualquier herramienta que acepte un `base URL` + `API key`: Cursor, Cline, Continue, Aider, Open Code, Open WebUI o cualquier SDK compatible con OpenAI.

## Obtener tu API Key

Debes estar dentro de la comunidad NaN. Si ya estás suscrito, genera tu API Key desde la sección de ajustes del usuario en el apartado "API Keys" de la [plataforma](https://cloud.nan.builders/). La key es personal e intransferible.

> **Nota**
> El soporte es solo para temas técnicos.

## Configurar tu herramienta

| Campo | Valor |
|---|---|
| base URL | `https://api.nan.builders/v1` |
| API Key | `sk-tu-key-aqui` |
| Model | `qwen3.6` |

Ejemplo de configuración OpenAI-compatible:

```json
provider: {
  openai: {
    npm: "@ai-sdk/openai",
    name: "NaN",
    apiKey: "sk-tu-key-aqui",
    baseURL: "https://api.nan.builders/v1",
    model: "qwen3.6"
  }
}
```
