---
title: Elige tu modelo
description: Qué modelo pedir para cada tarea y cómo se escribe exactamente su id.
order: 2
group: Primeros pasos
---

# Elige tu modelo.

En NaN cambiar de modelo es cambiar una palabra. Todos se llaman igual, por el mismo endpoint y con el mismo formato de petición: lo único que cambia es el valor del campo `model`.

```json
{
  "model": "deepseek-v4-flash",
  "messages": [{ "role": "user", "content": "Hola" }]
}
```

Ese valor es el **id del modelo**, y tiene que escribirse exacto. Un punto de más o un guion de menos y la API responde `404` con `model_not_found`. Esta página es la lista buena.

## Empieza por aquí

Si no sabes cuál coger, busca en la primera columna lo que quieres hacer.

| Quiero | Pide | Por qué |
|---|---|---|
| Chatear o razonar sobre algo, sin más | `deepseek-v4-flash` | Es el mejor de propósito general del clúster y lee imágenes |
| Mover un agente de código en sesiones largas | `glm5.3` | Está pensado para eso. Necesita el tier premium |
| Lo mismo, pero sin el tier premium | `glm5.3-flash` | Mismo contexto de 1M y cuota generosa |
| Que conteste rápido | `qwen3.8-flash` | Menos profundidad, mucha menos espera |
| Pasarle un audio al modelo directamente | `mimo-v2.5` | Es el único que oye |
| Describir o analizar una imagen | `deepseek-v4-flash` | Cualquiera menos `glm5.3` sirve; este es el mejor |
| Probar cosas sin gastar cuota | `gemma4` | No tiene contador de tokens |
| Montar un buscador o un RAG | `qwen3-embedding` y después `rerank` | Primero recuperas por similitud, luego reordenas por relevancia |
| Convertir texto en audio | `kokoro` | 67 voces, dos de ellas en español |
| Transcribir audio | `whisper` | Más de 99 idiomas, con detección automática |
| Generar o editar una imagen | `flux-2-klein` | Texto a imagen e imagen a imagen |

## Todos los modelos

| id | Para qué | Contexto | Acepta | Cuota |
|---|---|---|---|---|
| `deepseek-v4-flash` | Chat y razonamiento general | 1M | texto · imagen | 3B tokens/mes |
| `glm5.3` | Agentes de código y tareas largas | 1M | texto | 3B tokens/periodo de facturación |
| `glm5.3-flash` | Agentes de código, sin premium | 1M | texto · imagen | 2B tokens/mes |
| `qwen3.8-flash` | Respuestas rápidas | 262K | texto · imagen | 500M tokens/mes |
| `mimo-v2.5` | Audio de entrada, omnimodal | 1M | texto · imagen · audio | 1.0B tokens/mes |
| `gemma4` | Tareas cortas y pruebas | 262K | texto · imagen | sin contador |
| `qwen3.6` | Generación anterior | 262K | texto · imagen | sin contador |
| `qwen3-embedding` | Vectores de 4096 dimensiones | - | texto | sin contador |
| `rerank` | Reordenar por relevancia | - | texto | sin contador |
| `kokoro` | Texto a voz | - | texto | sin contador |
| `whisper` | Voz a texto | - | audio | sin contador |
| `flux-2-klein` | Generar y editar imágenes | - | texto · imagen | 100 peticiones/mes |

Las fichas completas, con parámetros, licencias y modos de razonamiento, están en [Modelos](/es/docs/models).

> **`glm5.3` es el único que no entra con la suscripción normal**
> Necesita una clave en el tier premium. Si lo pides sin él, la respuesta es un **`401`**, no un `403`: "This API key does not have access to the requested model". Parece una clave rota y no lo es, así que mira el tier antes de ponerte a rotar credenciales. Tampoco aparece en `GET /v1/models`. Todos los demás los puede llamar cualquier miembro.

## Cómo se leen los ids

- **El id no es el nombre comercial.** El modelo que en su casa se llama "GLM 5.3 Flash" aquí es `glm5.3-flash`, en minúsculas, sin espacios y con el punto de la versión.
- **`-flash` significa rápido**, no pequeño ni peor: son variantes optimizadas para latencia.
- **El punto de la versión cuenta.** `qwen3.6` y `qwen3.8-flash` son modelos distintos, y `mimo-v2.5` lleva el punto donde lo lleva.
- **Los ids no cambian de significado.** Cuando servimos una variante nueva de un modelo mantenemos su id si la API es la misma. `deepseek-v4-flash`, por ejemplo, pasó a leer imágenes sin cambiar de nombre.
- **Los ids viejos no se apagan de golpe.** `qwen3.6` sigue respondiendo para que las configuraciones que ya lo nombran no se rompan, pero no es lo que te conviene si empiezas hoy.

## Qué significa la cuota

La columna de cuota cuenta tres cosas distintas:

- **`/mes`** es un contador de tokens que vuelve a cero con el mes natural.
- **`/periodo de facturación`** vuelve a cero cuando arranca tu periodo en Stripe, que casi nunca es el día 1. Solo `glm5.3` va así, y además tiene un tope aparte de tokens por cada ventana móvil de 4 horas, que es con el que topa antes una sesión intensiva de agente.
- **`sin contador`** significa que no hay contador de tokens asociado, no que sea infinito: los límites de peticiones por minuto se aplican igual a todos.

Cuando agotas una cuota, la API responde `402` o `429` y no se arregla reintentando. Las cifras vigentes de límites están al final de [Modelos](/es/docs/models).

## La lista que puede usar tu clave

Esta página se escribe a mano y el clúster se mueve. La respuesta definitiva, y además filtrada por lo que tu clave puede llamar de verdad, te la da la propia API:

```bash
curl https://api.nan.builders/v1/models \
  -H "Authorization: Bearer $NAN_API_KEY"
```

Si un id aparece ahí, funciona. Si no aparece, no lo tienes disponible, aunque lo leas en otro sitio.

## Siguientes pasos

- [Configurar tu agente](/es/docs/agent-setup): dónde poner el id en Cursor, Claude Code, Codex, Cline, OpenCode o Zed.
- [Ejemplos](/es/docs/examples): una llamada completa por cada tipo de modelo.
- [Modelos](/es/docs/models): las fichas técnicas, modelo a modelo.
