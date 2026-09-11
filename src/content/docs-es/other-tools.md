---
title: Otras herramientas
description: Continue, Aider, OpenClaw y cualquier interfaz compatible con OpenAI.
order: 15
group: Configurar tu agente
---

# Otras herramientas.

Todo lo que acepte una base URL y una API key de OpenAI funciona con NaN. Aquí están las configuraciones de las herramientas que no tienen página propia.

En todas, los dos datos son los mismos:

| Campo | Valor |
|---|---|
| Base URL | `https://api.nan.builders/v1` |
| API key | tu clave, la que empieza por `sk-` |

## Continue

Extensión para VS Code y JetBrains. Edita `~/.continue/config.yaml`:

```yaml
name: NaN
version: 1.0.0
schema: v1
models:
  - name: GLM 5.3 Flash
    provider: openai
    model: glm5.3-flash
    apiBase: https://api.nan.builders/v1
    apiKey: sk-tu-clave
    roles:
      - chat
      - edit
  - name: DeepSeek V4 Flash
    provider: openai
    model: deepseek-v4-flash
    apiBase: https://api.nan.builders/v1
    apiKey: sk-tu-clave
    roles:
      - chat
```

`provider: openai` no significa que llame a OpenAI: es el nombre del adaptador que habla ese formato. Lo que decide a dónde va la petición es `apiBase`.

## Aider

Agente de terminal que trabaja sobre tu repositorio de git. Aider enruta por el prefijo del modelo, así que el id tiene que ir precedido de `openai/`:

```bash
export OPENAI_API_BASE="https://api.nan.builders/v1"
export OPENAI_API_KEY="sk-tu-clave"

aider --model openai/glm5.3-flash
```

Para no repetirlo cada vez, déjalo en `~/.aider.conf.yml`:

```yaml
openai-api-base: https://api.nan.builders/v1
model: openai/glm5.3-flash
```

Sin el prefijo `openai/`, Aider intenta adivinar el proveedor a partir del nombre, no lo reconoce y falla antes de llegar a hacer la petición.

## Pi

Tiene página propia: [Pi](/es/docs/pi).

## OpenClaw

Configura `~/.openclaw/openclaw.json`:

```json
{
  "models": {
    "providers": {
      "nan": {
        "baseUrl": "https://api.nan.builders/v1",
        "apiKey": "sk-tu-clave",
        "api": "openai-completions",
        "models": [
          {
            "id": "glm5.3-flash",
            "name": "GLM 5.3 Flash",
            "reasoning": true,
            "input": ["text", "image"],
            "contextWindow": 1000000,
            "maxTokens": 65536
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "nan/glm5.3-flash" },
      "models": {
        "nan/glm5.3-flash": {
          "params": { "maxTokens": 16000 }
        }
      }
    }
  }
}
```

`maxTokens: 65536` es el máximo que admite el modelo. `params.maxTokens: 16000` es lo que se envía en cada petición, que es un buen equilibrio para la mayoría de tareas. Si necesitas respuestas más largas, súbelo, pero ten en cuenta que el razonamiento también sale de ese presupuesto.

## Open WebUI, LM Studio y demás interfaces de chat

Todas piden lo mismo, con nombres distintos según la aplicación: una dirección de API de OpenAI y una clave.

- **Open WebUI**: Settings, Connections, OpenAI API. Pon la base URL y la clave, y los modelos aparecen solos en el selector.
- **LM Studio**: en la pestaña de proveedores remotos, añade un proveedor compatible con OpenAI con esos mismos dos datos.

Si la aplicación te pide "OpenAI API Base", "API Endpoint" o "Custom base URL", todas son el mismo campo y todas quieren `https://api.nan.builders/v1`.

## Tu propio código

No hace falta ninguna herramienta: el SDK oficial de OpenAI, en Python o en JavaScript, funciona cambiándole la base URL. Está en [Primeros pasos](/es/docs/getting-started) y con más ejemplos en [Ejemplos](/es/docs/examples).
