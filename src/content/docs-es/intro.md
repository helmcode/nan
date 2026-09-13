---
title: Introducción
description: Conecta tus herramientas favoritas (OpenCode, Cursor, Cline, etc.) a nuestro clúster de inferencia compartido.
order: 0
group: Primeros pasos
---

# Bienvenido a NaN.

Esta documentación explica cómo conectar tus herramientas a nuestras GPUs. El clúster ejecuta modelos abiertos con una API compatible con OpenAI. Si algo acepta una `base URL` y una `API key`, funciona con NaN. La excepción es una herramienta que hable otro protocolo: [Claude Code](/es/docs/claude-code) habla con la API de Anthropic, no con una compatible con OpenAI, así que llega al clúster a través de OpenCode o de una pasarela local. Su página explica las dos formas.

> **Para conseguir tu API Key**
> Tienes que ser miembro de la comunidad de NaN. Puedes generar tu API Key desde los ajustes de usuario, en el apartado "API Keys" de la [plataforma](https://cloud.nan.builders/). La key es personal e intransferible.

## Lo esencial

| Campo | Valor |
|---|---|
| Base URL | `https://api.nan.builders/v1` |
| Autenticación | `Authorization: Bearer sk-tu-clave` |
| Formato | Compatible con OpenAI |

Los límites van por API key — un tope de peticiones por minuto y un máximo de peticiones a la vez — y algunos modelos suman el suyo propio. Las cifras vigentes están al final de [Modelos](/es/docs/models), que es donde se publican para que no haya dos versiones de la misma cifra.

## Por dónde seguir

- [Primeros pasos](/es/docs/getting-started): de cero a tu primera respuesta, con curl, Python y Node.
- [Elige tu modelo](/es/docs/choose-a-model): qué modelo pedir para cada tarea y cómo se escribe su id.
- [Configurar tu agente](/es/docs/agent-setup): Claude Code, Codex, Cursor, Cline, OpenCode, Zed y compañía.
- [CLI de NaN](/es/docs/nan-cli): la herramienta oficial de terminal, que además configura varias de ellas por ti.
- [Servidor MCP](/es/docs/mcp): la búsqueda web de NaN dentro de tu agente.
- [Referencia de la API](/es/docs/api): todos los endpoints, campo a campo.
- [Modelos](/es/docs/models): las fichas técnicas y los límites.
- [Ejemplos](/es/docs/examples): fragmentos en Python, Node.js y curl.
- Soporte: reporta incidencias en `#support` de Discord.
