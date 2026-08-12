---
title: Introducción
description: Conecta tus herramientas favoritas (OpenCode, Cursor, Cline, etc.) a nuestro clúster de inferencia compartido.
order: 0
group: Primeros pasos
---

# Bienvenido a NaN.

Esta documentación explica cómo conectar tus herramientas a nuestras GPUs. El clúster ejecuta modelos abiertos con una API compatible con OpenAI. Si algo acepta una `base URL` y una `API key`, funciona con NaN.

> **Para conseguir tu API Key**
> Tienes que ser miembro de la comunidad de NaN. Puedes generar tu API Key desde los ajustes de usuario, en el apartado "API Keys" de la [plataforma](https://cloud.nan.builders/). La key es personal e intransferible.

## Rate limits

| Métrica | Valor |
|---|---|
| Peticiones por minuto | 60 rpm |
| Máximo en paralelo | 5 concurrentes |

## Por dónde seguir

- [Primeros pasos](/es/docs/getting-started): endpoint, autenticación y configuración paso a paso.
- [Modelos](/es/docs/models): capacidades y límites de los modelos.
- [Ejemplos](/es/docs/examples): fragmentos en Python, Node.js y curl.
- Soporte: reporta incidencias en `#support` de Discord.
