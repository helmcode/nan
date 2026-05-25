---
title: Ejemplos
description: Code snippets para conectar a la API de NaN con Python, Node.js, curl y más.
order: 4
---

# Code snippets.

Ejemplos para conectar a la API con diferentes lenguajes y herramientas. Usa `https://api.nan.builders/v1` como base URL y tu API key personal.

## modelo: qwen3.6

generación de texto y chat

### curl

```curl
curl https://api.nan.builders/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-tu-key-aqui" \
  -d '{
    "model": "qwen3.6",
    "messages": [{"role": "user", "content": "Hola, ¿cómo estás?"}],
    "max_tokens": 500
  }'
```

### python (openai)

```python
from openai import OpenAI

client = OpenAI(
  api_key="sk-tu-key-aqui",
  base_url="https://api.nan.builders/v1"
)

response = client.chat.completions.create(
  model="qwen3.6",
  messages=[{"role": "user", "content": "Escribe un hola mundo en Rust"}],
  max_tokens=500,
  stream=True
)

for chunk in response:
    content = chunk.choices[0].delta.content
    if content:
        print(content, end="", flush=True)
```

Instalar: `pip install openai`

### node.js (openai)

```node.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-tu-key-aqui",
  baseURL: "https://api.nan.builders/v1",
});

const stream = await client.chat.completions.create({
  model: "qwen3.6",
  messages: [{ role: "user", content: "Escribe un hola mundo en Zig" }],
  max_tokens: 500,
  stream: true,
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) process.stdout.write(content);
}
```

Instalar: `npm install openai`

### opencode.json (config)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "nan": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "NaN",
      "options": {
        "baseURL": "https://api.nan.builders/v1",
        "apiKey": "sk-tu-key-aqui"
      },
      "models": {
        "qwen3.6": {
          "name": "Qwen 3.6",
          "contextWindow": 262144,
          "modalities": {
            "input": ["text", "image"],
            "output": ["text"]
          }
        },
        "gemma4": {
          "name": "Gemma 4",
          "contextWindow": 262144,
          "modalities": {
            "input": ["text", "image"],
            "output": ["text"]
          }
        },
        "deepseek-v4-flash": {
          "name": "DeepSeek V4 Flash",
          "contextWindow": 500000,
          "modalities": {
            "input": ["text"],
            "output": ["text"]
          }
        }
      }
    }
  },
  "compaction": {
    "auto": true,
    "prune": true,
    "reserved": 50000
  }
}
```

Este es el config para conectar IDEs (Cursor, OpenCode) con los 3 modelos disponibles: `qwen3.6`, `gemma4` y `deepseek-v4-flash`.

### .pi/agent/models.json (config)

```json
{
  "providers": {
    "nan": {
      "baseUrl": "https://api.nan.builders/v1",
      "api": "openai-completions",
      "apiKey": "<api-key>",
      "compat": {
        "supportsDeveloperRole": true
      },
      "models": [
        {
          "id": "qwen3.6",
          "name": "Qwen 3.6",
          "reasoning": true,
          "input": ["text", "image"],
          "contextWindow": 262144,
          "maxTokens": 16384
        },
        {
          "id": "gemma4",
          "name": "Gemma 4",
          "reasoning": true,
          "input": ["text", "image"],
          "contextWindow": 262144,
          "maxTokens": 16384
        }
      ]
    }
  }
}
```

Config para `~/.pi/agent/models.json`

### openclaw.json (config)

```json
{
  "models": {
    "providers": {
      "nan": {
        "baseUrl": "https://api.nan.builders/v1",
        "apiKey": "sk-...",
        "api": "openai-completions",
        "models": [
          {
            "id": "qwen3.6",
            "name": "Qwen 3.6",
            "reasoning": true,
            "input": ["text", "image"],
            "contextWindow": 262144,
            "maxTokens": 65536
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "nan/qwen3.6" },
      "models": {
        "nan/qwen3.6": {
          "params": {
            "maxTokens": 16000
          }
        }
      }
    }
  }
}
```

Config para `~/.openclaw/openclaw.json`

`maxTokens: 65536` es el máximo que soporta el modelo. `params.maxTokens: 16000` es lo que se envía por request. 16K es un buen balance para la mayoría de tareas. Si necesitas respuestas más largas, súbelo — pero ten en cuenta que el reasoning también consume de ese presupuesto.

### settings.json (Zed)

```zed
{
  "language_models": {
    "openai": {
      "api_url": "https://api.nan.builders/v1",
      "available_models": [
        {
          "name": "qwen3.6",
          "display_name": "NaN",
          "max_tokens": 262144
        }
      ]
    }
  },
  "edit_predictions": {
    "open_ai_compatible_api": {
      "api_url": "https://api.nan.builders/v1",
      "model": "qwen3.6"
    }
  }
}
```

Config para `~/.config/zed/settings.json` — incluye inline predictions.

## modelo: qwen3-embedding

embeddings vectoriales

### curl

```curl
curl https://api.nan.builders/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-tu-key-aqui" \
  -d '{
    "model": "qwen3-embedding",
    "input": ["Hola mundo", "Hello world"],
    "encoding_format": "float"
  }'
# → 4096-dimensional vectors per input
```

### python

```python
from openai import OpenAI

client = OpenAI(
  api_key="sk-tu-key-aqui",
  base_url="https://api.nan.builders/v1"
)

response = client.embeddings.create(
  model="qwen3-embedding",
  input=["Kubernetes pod scheduling", "Programación de pods Kubernetes"],
  encoding_format="float"
)

embeddings = [d.embedding for d in response.data]
print(len(embeddings[0]))  // 4096
```

### node.js

```node.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-tu-key-aqui",
  baseURL: "https://api.nan.builders/v1",
});

const response = await client.embeddings.create({
  model: "qwen3-embedding",
  input: ["Hello world", "Hola mundo"],
  encoding_format: "float",
});

const embeddings = response.data.map((d) => d.embedding);
console.log(embeddings[0].length);  // 4096
```

## modelo: kokoro

text-to-speech

### curl

```curl
curl https://api.nan.builders/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-tu-key-aqui" \
  -d '{
    "model": "kokoro",
    "input": "Bienvenido a NaN builders.",
    "voice": "ef_dora"
  }' \
  -o speech.mp3

# Spanish female voice (ef_dora), English (af_heart), etc.
# Ver todas las voces: https://github.com/hexgrad/Kokoro-82M
```

### python

```python
from openai import OpenAI

client = OpenAI(
  api_key="sk-tu-key-aqui",
  base_url="https://api.nan.builders/v1"
)

response = client.audio.speech.create(
  model="kokoro",
  voice="ef_dora",
  input="Hola, bienvenido a NaN builders.",
  speed=1.0,
  response_format="mp3"
)

response.stream_to_file("output.mp3")

# English voice
response = client.audio.speech.create(
  model="kokoro",
  voice="af_heart",
  input="Welcome to NaN builders.",
  response_format="mp3"
)
```

### node.js

```node.js
import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({
  apiKey: "sk-tu-key-aqui",
  baseURL: "https://api.nan.builders/v1",
});

const response = await client.audio.speech.create({
  model: "kokoro",
  voice: "ef_dora",
  input: "Hola, bienvenido a NaN builders.",
  speed: 1.0,
  response_format: "mp3",
});

const buffer = Buffer.from(await response.arrayBuffer());
fs.writeFileSync("output.mp3", buffer);
```

## modelo: whisper

speech-to-text

### curl

```curl
# Transcribe audio file
curl https://api.nan.builders/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-tu-key-aqui" \
  -F "model=whisper" \
  -F "file=@recording.mp3" \
  -F "language=es"

# → {"text":"Texto transcrito","language":"es","duration":5.2}

# Translate to English
curl https://api.nan.builders/v1/audio/translations \
  -H "Authorization: Bearer sk-tu-key-aqui" \
  -F "model=whisper" \
  -F "file=@grabacion.mp3"
```

### python

```python
from openai import OpenAI

client = OpenAI(
  api_key="sk-tu-key-aqui",
  base_url="https://api.nan.builders/v1"
)

# Transcribe Spanish audio
with open("grabacion.mp3", "rb") as f:
    result = client.audio.transcriptions.create(
        model="whisper",
        file=f,
        language="es",
        response_format="verbose_json"
    )

print(result.text)              # Transcribed text
print(result.language)          # "es"
print(result.duration)          # 5.2 (seconds)

# Translate to English
with open("grabacion.mp3", "rb") as f:
    translation = client.audio.translations.create(
        model="whisper",
        file=f
    )
print(translation.text)  # English translation
```

### node.js

```node.js
import OpenAI from "openai";
import fs from "fs";
import FormData from "form-data";

const client = new OpenAI({
  apiKey: "sk-tu-key-aqui",
  baseURL: "https://api.nan.builders/v1",
});

// Transcribe audio
const file = fs.createReadStream("grabacion.mp3");
const form = FormData();
form.append("file", file);

const result = await client.audio.transcriptions.create({
  model: "whisper",
  file,
  language: "es",
  response_format: "verbose_json",
});

console.log(result.text);       // Texto transcrito
console.log(result.language);   // "es"
console.log(result.duration);   // 5.2
```

## Integración en IDEs

- **Cursor**: Settings → OpenAI API → Base URL: `https://api.nan.builders/v1`, API Key: tu key
- **Zed**: Settings → `settings.json` → ver [config completo arriba](#qwen36-zed)
- **Cline / Continue / Aider**: Configura las vars de entorno:

```bash
export OPENAI_BASE_URL="https://api.nan.builders/v1"
export OPENAI_API_KEY="sk-tu-key-aqui"
```
