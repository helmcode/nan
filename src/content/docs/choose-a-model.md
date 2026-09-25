---
title: Choose your model
description: Which model to ask for each task, and exactly how its id is spelled.
order: 2
group: Get started
---

# Choose your model.

On NaN, switching models means changing one word. They are all called the same way, through the same endpoint and with the same request format: the only thing that changes is the value of the `model` field.

```json
{
  "model": "deepseek-v4-flash",
  "messages": [{ "role": "user", "content": "Hello" }]
}
```

That value is the **model id**, and it has to be spelled exactly. One dot too many or one hyphen too few and the API answers `404` with `model_not_found`. This page is the good list.

## Start here

If you do not know which one to pick, look for what you want to do in the first column.

| I want to | Ask for | Why |
|---|---|---|
| Chat or reason about something, plainly | `deepseek-v4-flash` | It is the best general-purpose model on the cluster, and it reads images |
| Drive a coding agent through long sessions | `glm5.3` | It is built for that. Needs the premium tier |
| The same, but without the premium tier | `glm5.3-flash` | Same 1M context and a generous quota |
| Get an answer fast | `qwen3.8-flash` | Less depth, much less waiting |
| Hand the model an audio file directly | `mimo-v2.5` or `mimo-v2.6-flash` | Both hear audio natively |
| Describe or analyze an image | `deepseek-v4-flash` | Any of them except `glm5.3` will do; this is the best |
| Try things without spending quota | `gemma4` | It has no token counter |
| Build a search engine or a RAG | `qwen3-embedding` and then `rerank` | First you retrieve by similarity, then you reorder by relevance |
| Turn text into audio | `kokoro` | 67 voices, two of them Spanish |
| Transcribe audio | `whisper` | More than 99 languages, with automatic detection |
| Generate or edit an image | `flux-2-klein` | Text to image and image to image |

## Every model

| id | What for | Context | Accepts | Quota |
|---|---|---|---|---|
| `deepseek-v4-flash` | General chat and reasoning | 1M | text · image | 3B tokens/month |
| `glm5.3` | Coding agents and long tasks | 1M | text | 3B tokens/billing period |
| `glm5.3-flash` | Coding agents, without premium | 1M | text · image | 2B tokens/month |
| `qwen3.8-flash` | Fast answers | 262K | text · image | 500M tokens/month |
| `mimo-v2.5` | Audio input, omnimodal | 1M | text · image · audio | 1.0B tokens/month |
| `mimo-v2.6-flash` | The newest MiMo, omnimodal | 1M | text · image · audio | 1.0B tokens/month |
| `gemma4` | Short tasks and testing | 262K | text · image | no counter |
| `qwen3.6` | Previous generation | 262K | text · image | no counter |
| `qwen3-embedding` | 4096-dimension vectors | - | text | no counter |
| `rerank` | Reorder by relevance | - | text | no counter |
| `kokoro` | Text to speech | - | text | no counter |
| `whisper` | Speech to text | - | audio | no counter |
| `flux-2-klein` | Generate and edit images | - | text · image | 100 requests/month |

The full spec sheets, with parameters, licenses and reasoning modes, are in [Models](/docs/models).

> **`glm5.3` is the only one the normal subscription does not cover**
> It needs a key on the premium tier. If you ask for it without one, the answer is a **`401`**, not a `403`: "This API key does not have access to the requested model". It reads like a broken key and it is not, so check the tier before you go rotating credentials. It does not show up in `GET /v1/models` either.
>
> Every other model **in the table above** can be called by any member. Go by that table rather than by `GET /v1/models`: that endpoint answers with what the cluster is running, which is not the same question as what your key can call, so an id can appear there and still come back `401`.

## How to read the ids

- **The id is not the commercial name.** The model its makers call "GLM 5.3 Flash" is `glm5.3-flash` here, lowercase, no spaces, and with the version dot.
- **`-flash` means fast**, not small or worse: these are variants optimized for latency.
- **The version dot counts.** `qwen3.6` and `qwen3.8-flash` are different models, and `mimo-v2.5` carries its dot where it carries it.
- **Ids do not change meaning.** When we serve a new variant of a model we keep its id if the API is the same. `deepseek-v4-flash`, for instance, started reading images without changing its name.
- **Old ids are not switched off overnight.** `qwen3.6` still answers so that configurations already naming it do not break, but it is not what you want if you are starting today.

## What the quota means

The quota column counts three different things:

- **`/month`** is a token counter that goes back to zero with the calendar month.
- **`/billing period`** goes back to zero when your period starts in Stripe, which is almost never the 1st. Only `glm5.3` works that way, and it also has a separate token cap for each rolling 4-hour window, which is the one an intensive agent session hits first.
- **`no counter`** means there is no token counter attached, not that it is infinite: the requests-per-minute limits apply to all of them just the same.

When you exhaust a quota, the API answers `402` or `429` and retrying does not fix it. The current limit figures are at the end of [Models](/docs/models).

## The list your key can use

This page is written by hand and the cluster moves. The definitive answer, filtered by what your key can actually call, comes from the API itself:

```bash
curl https://api.nan.builders/v1/models \
  -H "Authorization: Bearer $NAN_API_KEY"
```

If an id shows up there, it works. If it does not, you do not have it available, whatever you read somewhere else.

## Next steps

- [Set up your agent](/docs/agent-setup): where to put the id in Cursor, Claude Code, Codex, Cline, OpenCode or Zed.
- [Examples](/docs/examples): one complete call for each kind of model.
- [Models](/docs/models): the spec sheets, model by model.
