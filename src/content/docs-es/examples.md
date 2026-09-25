---
title: Ejemplos
description: Fragmentos de código para conectarte a la API de NaN con Python, Node.js, curl y más.
order: 18
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

## model: flux-2-klein

generación y edición de imágenes

### curl

```bash
curl https://api.nan.builders/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-key-here" \
  -d '{
    "model": "flux-2-klein",
    "prompt": "Un faro al atardecer sobre acantilados, fotográfico",
    "size": "1024x1024",
    "n": 1
  }'
# → {"created":...,"data":[{"url":"https://..."}]}
```

Cada lado de `size` tiene que ser divisible entre 16 y estar entre 256 y 1536, con una relación de aspecto entre 1:3 y 3:1. `n` llega hasta 4.

### python

```python
from openai import OpenAI

client = OpenAI(
  api_key="sk-your-key-here",
  base_url="https://api.nan.builders/v1"
)

image = client.images.generate(
  model="flux-2-klein",
  prompt="Un faro al atardecer sobre acantilados, fotográfico",
  size="1024x1024",
  extra_body={"seed": 42}
)

print(image.data[0].url)
```

El enlace es temporal, alrededor de 60 minutos. Pide `response_format="b64_json"` y los bytes llegan en `data[0].b64_json`, en base64, en lugar de detrás de un enlace. `seed` y `guidance` son extensiones de NaN, así que el SDK de OpenAI las manda por `extra_body`.

### node.js (imagen a imagen)

```javascript
import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({
  apiKey: "sk-your-key-here",
  baseURL: "https://api.nan.builders/v1",
});

const image = await client.images.edit({
  model: "flux-2-klein",
  image: fs.createReadStream("referencia.png"),
  prompt: "Convierte la escena en invierno, con nieve",
  size: "1024x1024",
});

console.log(image.data[0].url);
```

`/images/edits` acepta hasta cuatro imágenes de referencia (PNG, JPEG o WebP, de menos de 25 MB cada una) y no admite `mask`: mandar una devuelve `400`.

Las imágenes necesitan membresía de inferencia, `403` si no la tienes, y van por su propio presupuesto: 20 peticiones por minuto y 100 al mes, que no toca tu cuota de tokens.
## model: qwen-image-2.1

generación de texto a imagen

### curl

```bash
curl https://api.nan.builders/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-key-here" \
  -d '{
    "model": "qwen-image-2.1",
    "prompt": "Una pizarra con la palabra faro escrita en ella, rotulación limpia",
    "size": "1024x1024",
    "n": 1
  }'
# → {"created":...,"data":[{"url":"https://..."}]}
```

Cada lado de `size` tiene que ser divisible entre 16 y estar entre 512 y 1280, con una relación de aspecto entre 1:3 y 3:1. `n` llega hasta 4. Sin imágenes de referencia: este modelo es solo texto a imagen. `seed` es un entero en 0..2147483647.

### python

```python
from openai import OpenAI

client = OpenAI(
  api_key="sk-your-key-here",
  base_url="https://api.nan.builders/v1"
)

image = client.images.generate(
  model="flux-2-klein",
  prompt="Una pizarra con la palabra faro escrita en ella, rotulación limpia",
  size="1024x1024",
  extra_body={"seed": 42}
)

print(image.data[0].url)
```

El enlace es temporal, alrededor de 60 minutos. Pide `response_format="b64_json"` y los bytes llegan en `data[0].b64_json`, en base64, en lugar de detrás de un enlace. `seed` y `guidance` son extensiones de NaN, así que el SDK de OpenAI las manda por `extra_body`.

### node.js (imagen a imagen)

```javascript
import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({
  apiKey: "sk-your-key-here",
  baseURL: "https://api.nan.builders/v1",
});

const image = await client.images.edit({
  model: "flux-2-klein",
  image: fs.createReadStream("referencia.png"),
  prompt: "Convierte la escena en invierno, con nieve",
  size: "1024x1024",
});

console.log(image.data[0].url);
```

`/images/edits` acepta hasta cuatro imágenes de referencia (PNG, JPEG o WebP, de menos de 25 MB cada una) y no admite `mask`: mandar una devuelve `400`.

Las imágenes necesitan membresía de inferencia, `403` si no la tienes, y van por su propio presupuesto: 20 peticiones por minuto y 100 al mes, que no toca tu cuota de tokens.

## Conectar tu editor o tu agente

Las configuraciones de Cursor, Claude Code, Codex, Cline, OpenCode, Zed y el resto están en [Configurar tu agente](/es/docs/agent-setup), con una página por herramienta.
