---
title: Introducción
description: Conecta tus herramientas favoritas (OpenCode, Cursor, Cline, etc) a nuestro cluster compartido de inferencia.
order: 0
---

# Bienvenido a NaN.

Esta doc explica cómo conectar tus herramientas a nuestras GPUs. El cluster corre modelos abiertos con una API compatible con OpenAI. Si algo acepta un `base URL` + `API key`, funciona con NaN.

> **Para obtener tu API Key**
> Debes estar dentro de la comunidad NaN. Puedes generar tu API Key desde la sección de ajustes del usuario en el apartado "API Keys" de la [plataforma](https://cloud.nan.builders/). La key es personal e intransferible.

## Rate limits

| Métrica | Valor |
|---|---|
| Requests por minuto | 60 rpm |
| Paralelo máximo | 5 concurrentes |

## Qué hacer a continuación

- [Conectarse](/docs/getting-started): endpoint, auth y configuración paso a paso.
- [Modelos](/docs/models): capacidades y límites de los modelos.
- [Ejemplos](/docs/examples): snippets en Python, Node.js y curl.
- Soporte: reporta problemas por `#support` en Discord.
