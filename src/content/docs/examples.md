---
title: Examples
description: Code snippets to connect to the NaN API with Python, Node.js, curl, and more.
order: 4
---

# Code snippets.

Examples to connect to the API with different languages and tools. Use `https://api.nan.builders/v1` as base URL and your personal API key.

## model: qwen3.6

text generation and chat

### curl

```bash
curl https://api.nan.builders/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-key-here" \
  -d '{
    "model": "qwen3.6",
    "messages": [{"role": "user", "content": "Hello, how are you?"}],
    "max_tokens": 500
  }'
```

### python (openai)

```python
from openai import OpenAI

client = OpenAI(
  api_key="sk-your-key-here",
  base_url="https://api.nan.builders/v1"
)

response = client.chat.completions.create(
  model="qwen3.6",
  messages=[{"role": "user", "content": "Write a hello world in Rust"}],
  max_tokens=500,
  stream=True
)

for chunk in response:
    content = chunk.choices[0].delta.content
    if content:
        print(content, end="", flush=True)
```

Install: `pip install openai`

### node.js (openai)

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-your-key-here",
  baseURL: "https://api.nan.builders/v1",
});

const stream = await client.chat.completions.create({
  model: "qwen3.6",
  messages: [{ role: "user", content: "Write a hello world in Zig" }],
  max_tokens: 500,
  stream: true,
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) process.stdout.write(content);
}
```

Install: `npm install openai`

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
        "apiKey": "sk-your-key-here"
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
        },
        "mimo-v2.5": {
          "name": "Xiaomi MiMo V2.5",
          "contextWindow": 500000,
          "modalities": {
            "input": ["text", "image", "audio"],
            "output": ["text"]
          }
        },
        "glm5.2": {
          "name": "GLM 5.2",
          "contextWindow": 262144,
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

This is the config to connect IDEs (Cursor, OpenCode) with the 5 available LLM models: `qwen3.6`, `gemma4`, `deepseek-v4-flash`, `mimo-v2.5` and `glm5.2`.

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
        },
        {
          "id": "glm5.2",
          "name": "GLM 5.2",
          "reasoning": true,
          "input": ["text"],
          "contextWindow": 262144,
          "maxTokens": 16384
        }
      ]
    }
  }
}
```

Config for `~/.pi/agent/models.json`

### .pi/agent/settings.json (config)

```json
{
  "defaultProvider": "nan",
  "defaultModel": "qwen3.6"
}
```

Config for `~/.pi/agent/settings.json`. Without `defaultProvider` and `defaultModel`, Pi uses its default provider and returns an authentication error (401).

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
          },
          {
            "id": "glm5.2",
            "name": "GLM 5.2",
            "reasoning": true,
            "input": ["text"],
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

Config for `~/.openclaw/openclaw.json`

`maxTokens: 65536` is the maximum the model supports. `params.maxTokens: 16000` is what is sent per request. 16K is a good balance for most tasks. If you need longer responses, increase it — but keep in mind that reasoning also consumes from that budget.

<h3 id="qwen36-zed">settings.json (Zed)</h3>

```json
{
  "language_models": {
    "openai": {
      "api_url": "https://api.nan.builders/v1",
      "available_models": [
        {
          "name": "qwen3.6",
          "display_name": "NaN",
          "max_tokens": 262144
        },
        {
          "name": "glm5.2",
          "display_name": "NaN GLM 5.2",
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

Config for `~/.config/zed/settings.json` — includes inline predictions.

## model: qwen3-embedding

vector embeddings

### curl

```bash
curl https://api.nan.builders/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-key-here" \
  -d '{
    "model": "qwen3-embedding",
    "input": ["Hello world", "Hola mundo"],
    "encoding_format": "float"
  }'
# → 4096-dimensional vectors per input
```

### python

```python
from openai import OpenAI

client = OpenAI(
  api_key="sk-your-key-here",
  base_url="https://api.nan.builders/v1"
)

response = client.embeddings.create(
  model="qwen3-embedding",
  input=["Kubernetes pod scheduling", "Pod scheduling in Kubernetes"],
  encoding_format="float"
)

embeddings = [d.embedding for d in response.data]
print(len(embeddings[0]))  // 4096
```

### node.js

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-your-key-here",
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

## model: rerank

semantic reranking — completes the RAG stack

### curl

```bash
curl https://api.nan.builders/v1/rerank \
  -H "Authorization: Bearer $NAN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "rerank",
    "query": "What is the capital of France?",
    "documents": [
      "Paris is the capital of France and home to the Eiffel Tower.",
      "Berlin is the capital of Germany.",
      "Madrid is the capital of Spain."
    ]
  }'
# → results[] ordered by relevance_score desc, with original index
```

### python

```python
import os
from openai import OpenAI

client = OpenAI(
  api_key=os.environ["NAN_API_KEY"],
  base_url="https://api.nan.builders/v1"
)

# The /rerank endpoint is not part of the standard OpenAI client,
# but we can invoke it with client.post().
response = client.post(
  path="/rerank",
  cast_to=object,
  body={
    "model": "rerank",
    "query": "What is the capital of France?",
    "documents": [
      "Paris is the capital of France and home to the Eiffel Tower.",
      "Berlin is the capital of Germany.",
      "Madrid is the capital of Spain.",
    ],
  },
)

for r in response["results"]:
    print(f"{r['index']}: {r['relevance_score']:.3f}")
```

Also works with raw `requests` or any HTTP client — the endpoint is OpenAI-compatible in authentication and payload format.

## model: kokoro

text-to-speech

### curl

```bash
curl https://api.nan.builders/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-key-here" \
  -d '{
    "model": "kokoro",
    "input": "Welcome to NaN builders.",
    "voice": "af_heart"
  }' \
  -o speech.mp3

# English female voice (af_heart), Spanish (ef_dora), etc.
# See all voices: https://github.com/hexgrad/Kokoro-82M
```

### python

```python
from openai import OpenAI

client = OpenAI(
  api_key="sk-your-key-here",
  base_url="https://api.nan.builders/v1"
)

response = client.audio.speech.create(
  model="kokoro",
  voice="af_heart",
  input="Hello, welcome to NaN builders.",
  speed=1.0,
  response_format="mp3"
)

response.stream_to_file("output.mp3")

# Spanish voice
response = client.audio.speech.create(
  model="kokoro",
  voice="ef_dora",
  input="Hola, bienvenido a NaN builders.",
  response_format="mp3"
)
```

### node.js

```javascript
import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({
  apiKey: "sk-your-key-here",
  baseURL: "https://api.nan.builders/v1",
});

const response = await client.audio.speech.create({
  model: "kokoro",
  voice: "af_heart",
  input: "Hello, welcome to NaN builders.",
  speed: 1.0,
  response_format: "mp3",
});

const buffer = Buffer.from(await response.arrayBuffer());
fs.writeFileSync("output.mp3", buffer);
```

## model: whisper

speech-to-text

### curl

```bash
# Transcribe audio file
curl https://api.nan.builders/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-your-key-here" \
  -F "model=whisper" \
  -F "file=@recording.mp3" \
  -F "language=en"

# → {"text":"Transcribed text","language":"en","duration":5.2}

# Translate to English
curl https://api.nan.builders/v1/audio/translations \
  -H "Authorization: Bearer sk-your-key-here" \
  -F "model=whisper" \
  -F "file=@recording.mp3"
```

### python

```python
from openai import OpenAI

client = OpenAI(
  api_key="sk-your-key-here",
  base_url="https://api.nan.builders/v1"
)

# Transcribe English audio
with open("recording.mp3", "rb") as f:
    result = client.audio.transcriptions.create(
        model="whisper",
        file=f,
        language="en",
        response_format="verbose_json"
    )

print(result.text)              # Transcribed text
print(result.language)          # "en"
print(result.duration)          # 5.2 (seconds)

# Translate to English
with open("recording.mp3", "rb") as f:
    translation = client.audio.translations.create(
        model="whisper",
        file=f
    )
print(translation.text)  # English translation
```

### node.js

```javascript
import OpenAI from "openai";
import fs from "fs";
import FormData from "form-data";

const client = new OpenAI({
  apiKey: "sk-your-key-here",
  baseURL: "https://api.nan.builders/v1",
});

// Transcribe audio
const file = fs.createReadStream("recording.mp3");
const form = FormData();
form.append("file", file);

const result = await client.audio.transcriptions.create({
  model: "whisper",
  file,
  language: "en",
  response_format: "verbose_json",
});

console.log(result.text);       // Transcribed text
console.log(result.language);   // "en"
console.log(result.duration);   // 5.2
```

## model: mimo-v2.5

omnimodal — chat, vision, and audio

### curl

```bash
curl https://api.nan.builders/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-key-here" \
  -d '{
    "model": "mimo-v2.5",
    "messages": [{"role": "user", "content": "Hello, how are you?"}],
    "max_tokens": 500
  }'
```

With reasoning enabled, `max_tokens ≥ 300` is recommended to leave room for reasoning.

### vision (curl)

```bash
curl https://api.nan.builders/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-key-here" \
  -d '{
    "model": "mimo-v2.5",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "What's in this image?"},
        {"type": "image_url", "image_url": {"url": "https://example.com/photo.jpg"}}
      ]
    }],
    "max_tokens": 500
  }'
```

### python (openai)

```python
from openai import OpenAI

client = OpenAI(
  api_key="sk-your-key-here",
  base_url="https://api.nan.builders/v1"
)

response = client.chat.completions.create(
  model="mimo-v2.5",
  messages=[{
    "role": "user",
    "content": [
      {"type": "text", "text": "Describe this image."},
      {"type": "image_url", "image_url": {"url": "https://example.com/photo.jpg"}}
    ]
  }],
  max_tokens=500
)

print(response.choices[0].message.content)
```

## IDE Integration

- **Cursor**: Settings → OpenAI API → Base URL: `https://api.nan.builders/v1`, API Key: your key
- **Zed**: Settings → `settings.json` → see [full config above](#qwen36-zed)
- **Cline / Continue / Aider**: Set the environment variables:

```bash
export OPENAI_BASE_URL="https://api.nan.builders/v1"
export OPENAI_API_KEY="sk-your-key-here"
```
