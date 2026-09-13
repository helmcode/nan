---
title: Ejemplos
description: Fragmentos de código para conectarte a la API de NaN con Python, Node.js, curl y más.
order: 19
group: Guías
---

# Fragmentos de código.

Ejemplos para conectarte a la API desde distintos lenguajes y herramientas. Usa `https://api.nan.builders/v1` como base URL y tu API key personal.

## model: deepseek-v4-flash

generación de texto, chat y visión

### curl

```bash
curl https://api.nan.builders/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-key-here" \
  -d '{
    "model": "deepseek-v4-flash",
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
  model="deepseek-v4-flash",
  messages=[{"role": "user", "content": "Write a hello world in Rust"}],
  max_tokens=500,
  stream=True
)

for chunk in response:
    content = chunk.choices[0].delta.content
    if content:
        print(content, end="", flush=True)
```

Instalación: `pip install openai`

### node.js (openai)

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-your-key-here",
  baseURL: "https://api.nan.builders/v1",
});

const stream = await client.chat.completions.create({
  model: "deepseek-v4-flash",
  messages: [{ role: "user", content: "Write a hello world in Zig" }],
  max_tokens: 500,
  stream: true,
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) process.stdout.write(content);
}
```

Instalación: `npm install openai`

## model: qwen3-embedding

embeddings vectoriales

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
print(len(embeddings[0]))  # 4096
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

reordenado semántico, completa el stack de RAG

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

También funciona con `requests` a pelo o con cualquier cliente HTTP: el endpoint es compatible con OpenAI tanto en la autenticación como en el formato del cuerpo.

## model: kokoro

texto a voz

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

voz a texto

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

const client = new OpenAI({
  apiKey: "sk-your-key-here",
  baseURL: "https://api.nan.builders/v1",
});

// Transcribe audio
const file = fs.createReadStream("recording.mp3");

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

omnimodal: chat, visión y audio

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

Con el razonamiento activado se recomienda `max_tokens ≥ 300`, para dejarle sitio.

### visión (curl)

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

## tool: web search

búsqueda web autenticada para agentes: `POST /v1/search`

### curl

```bash
curl https://api.nan.builders/v1/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-key-here" \
  -d '{
    "query": "latest go release",
    "count": 5,
    "freshness": "pw"
  }'
# → {"results":[{"title":...,"url":...,"snippet":...,"source":...}],"cached":false}
```

### python

```python
import os
from openai import OpenAI

client = OpenAI(
  api_key=os.environ["NAN_API_KEY"],
  base_url="https://api.nan.builders/v1"
)

# /search is not part of the standard OpenAI client, but we can invoke it with client.post().
response = client.post(
  path="/search",
  cast_to=object,
  body={
    "query": "latest go release",
    "count": 5,
    "freshness": "pw",
  },
)

for r in response["results"]:
    print(r["title"], "-", r["url"])
```

También funciona con `requests` a pelo o con cualquier cliente HTTP: manda el cuerpo JSON con tu key en el Bearer.

## Conectar tu editor o tu agente

Las configuraciones de Cursor, Claude Code, Codex, Cline, OpenCode, Zed y el resto están en [Configurar tu agente](/es/docs/agent-setup), con una página por herramienta.
