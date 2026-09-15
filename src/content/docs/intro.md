---
title: Introduction
description: Connect your favorite tools (OpenCode, Cursor, Cline, etc.) to our shared inference cluster.
order: 0
group: Get started
---

# Welcome to NaN.

This documentation explains how to connect your tools to our GPUs. The cluster runs open models behind an OpenAI-compatible API. If something accepts a `base URL` and an `API key`, it works with NaN. The exception is a tool that speaks a different protocol: [Claude Code](/docs/claude-code) talks to Anthropic's API, not to an OpenAI-compatible one, so it reaches the cluster through OpenCode or through a local gateway. Its page explains both.

> **To get your API Key**
> You have to be a member of the NaN community. You can generate your API Key from the user settings, under "API Keys" on the [platform](https://cloud.nan.builders/). The key is personal and non-transferable.

## The essentials

| Field | Value |
|---|---|
| Base URL | `https://api.nan.builders/v1` |
| Authentication | `Authorization: Bearer sk-your-key` |
| Format | OpenAI-compatible |

Limits are per API key — a cap on requests per minute and a maximum number of requests at once — and some models add one of their own on top. The current figures are at the end of [Models](/docs/models), which is where they are published so that no two versions of the same number go around.

## Where to go next

- [Getting started](/docs/getting-started): from zero to your first response, with curl, Python and Node.
- [Choose your model](/docs/choose-a-model): which model to ask for each task, and how its id is spelled.
- [Set up your agent](/docs/agent-setup): Claude Code, Codex, Cursor, Cline, OpenCode, Zed and company.
- [NaN CLI](/docs/nan-cli): the official terminal tool, which also configures several of them for you.
- [MCP server](/docs/mcp): NaN's web search inside your agent. **Deprecated**, being retired along with web search.
- [API reference](/docs/api): every endpoint, field by field.
- [Models](/docs/models): the spec sheets and the limits.
- [Examples](/docs/examples): snippets in Python, Node.js and curl.
- Support: report issues in `#support` on Discord.
