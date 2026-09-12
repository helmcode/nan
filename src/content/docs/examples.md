---
title: Examples
description: Code snippets to connect to the NaN API with Python, Node.js, curl, and more.
order: 19
group: Guides
---

# Code snippets.

Examples to connect to the API with different languages and tools. Use `https://api.nan.builders/v1` as base URL and your personal API key.

## model: deepseek-v4-flash

text generation, chat and vision

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

Install: `pip install openai`

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

Install: `npm install openai`

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

## tool: web search

authenticated web search for agents — `POST /v1/search`

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

Also works with raw `requests` or any HTTP client — send the JSON body with your Bearer key.

## Connect your editor or your agent

The configurations for Cursor, Claude Code, Codex, Cline, OpenCode, Zed and the rest are in [Set up your agent](/docs/agent-setup), with one page per tool.
