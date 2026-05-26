---
title: Agents
description: "Despliega agentes de IA en una microVM aislada con QEMU: Hermes, terminal web, carga de ficheros y observabilidad."
order: 5
---

# Agents.

NaN Cloud te deja desplegar agentes de IA en tu propia **microVM**: una máquina virtual ligera con QEMU + KVM, su propio kernel, su propio filesystem y acceso root completo. Aislada del host y del resto de miembros. El primer tipo de agente disponible es **Hermes**.

## Arquitectura

Cada agente corre dentro de su propia microVM con QEMU. En lugar de compartir el kernel del host (como un container normal), arranca con su propio kernel Linux. La VM monta un disco ext4 de 20 GiB sobre un volumen en modo block, persistente. Todo lo que haces dentro —`apt install`, `pip install`, edits en `/etc`, ficheros que subas, sesiones de bash— vive en ese disco y sobrevive a reinicios.

El shutdown es *graceful*: cuando reinicies o borres el agente, el sistema fuerza un `sync` y espera a que el journal de ext4 termine de vaciar antes de matar la VM. Sin corrupciones.

## Hermes

Hermes es un agente de IA conversacional que se conecta a Telegram. Puedes hablar con él, pedirle que gestione notas, ejecute comandos en su entorno, genere sitios web y mucho más.

### 1. Crear un bot de Telegram

Necesitas un bot de Telegram. Abre Telegram, busca [@BotFather](https://core.telegram.org/bots/tutorial#obtain-your-bot-token) y sigue las instrucciones para crear un bot nuevo. Copia el token que te da.

### 2. Crear el agente

Ve a [cloud.nan.builders/agents/new](https://cloud.nan.builders/agents/new) y rellena: nombre, tipo (Hermes), el token de Telegram, modelo y opcionalmente un *soul* (system prompt) que defina la personalidad de tu agente.

![Formulario de creación de agente](/docs/agents/create-agent-form.png)

### 3. Esperar a que esté Running

Tras crear el agente espera ~30 segundos a que el microVM arranque, formatee el disco la primera vez (`mkfs.ext4`) y siembre el sistema de ficheros. El estado pasa a `Running` y Hermes a `Ready`.

### 4. Hablar con tu agente

Busca tu bot en Telegram y envíale un mensaje. Hermes responderá usando el modelo que hayas configurado.

![Conversación con Hermes en Telegram](/docs/agents/telegram-hermes-chat.jpg)

> **Tu agente está listo.**
> Con estos 4 pasos ya tienes a Hermes funcionando. Lo que viene a continuación son funcionalidades adicionales del panel del agente: terminal web, subida de ficheros, observabilidad, exposición HTTP, Hermes UI y gestión de variables de entorno.

## Console — terminal web

La pestaña **Console** abre un terminal interactivo (`bash --login`) dentro de tu microVM, sin que tengas que configurar SSH. El stream va sobre WebSocket con xterm.js: resize automático cuando ajustas el panel, status pill arriba a la derecha y botón de reconexión si la sesión se cae.

Casos de uso típicos:

- Instalar paquetes: `apt update && apt install -y nginx`
- Inspeccionar logs internos del agente
- Mover ficheros que hayas subido a su ubicación final
- Tirar de `htop`, `df -h`, `journalctl`, etc.

> **Límites operativos**
> 1 sesión simultánea por agente · idle timeout 10 min · duración máxima 30 min por sesión.

## Files — subida de ficheros

La pestaña **Files** permite subir ficheros al microVM con drag-and-drop o picker. Multi-fichero, cola secuencial, progress bar en vivo con MiB/s. Los archivos aterrizan en `/persist/uploads/` y desde ahí los puedes mover con la Console.

- Tamaño máximo: **200 MiB** por fichero.
- Transporte: WebSocket con chunks de 256 KiB y backpressure end-to-end.
- Filename sanitizado server-side (sin path traversal).
- Listado en vivo de lo ya subido (refresca cada 5 s).

## Observability

La pestaña **Observability** agrupa tres sub-pestañas:

- **Logs** — stream en vivo de stdout/stderr del agente vía WebSocket. Buffer de las últimas 500 líneas en el cliente.
- **Events** — eventos de Kubernetes del Pod (BackOff, Scheduled, Pulled, Killing...) con tipo, razón, mensaje, edad y contador. Auto-refresh cada 15 s.
- **Metrics** — uso real de CPU, RAM y disco contra los límites configurados. CPU/RAM vía Prometheus (kubelet-cadvisor), disco vía `df` dentro del microVM (el filesystem es block-mode, kubelet no lo ve). Refresca cada 10 s.

## Web — exposición pública

La pestaña **Web** tiene dos sub-pestañas para sacar servicios HTTP del agente:

### HTTP

Cualquier servicio que tu agente sirva por HTTP (nginx, una API, un static-site) lo puedes exponer públicamente. Por ejemplo, pídele a Hermes que instale nginx con un HTML personalizado:

![Pidiendo a Hermes que instale nginx con un HTML personalizado](/docs/agents/telegram-nginx-setup.jpg)

En la pestaña **Web → HTTP** pulsa **Enable HTTP**. Por defecto se expone el puerto `80`; si tu servicio escucha en otro puerto, indícalo en **Container Port**. La plataforma genera una URL pública en `*.apps.nan.builders`.

![Sitio web generado por Hermes visible desde la URL pública](/docs/agents/http-result.png)

### Hermes UI

Hermes incluye una UI web ligera ([nesquena/hermes-webui](https://github.com/nesquena/hermes-webui)) que se ejecuta siempre dentro del agente. Desde **Web → Hermes UI** puedes habilitar acceso externo: la plataforma genera una URL del estilo `webui-<agent>-<user>.apps.nan.builders` protegida por una contraseña per-agent que aparece en el panel.

## Variables de entorno

La pestaña **Env** permite añadir, editar y borrar variables de entorno del agente sin tocar el Deployment. Útil para inyectar API keys de terceros, configurar comportamiento de Hermes, etc.

Dos variables son **protegidas** (sólo edit, no delete): `OPENAI_API_KEY` (tu key del cluster, gestionada por la plataforma) y `TELEGRAM_BOT_TOKEN`. El resto son creación / edición / borrado libre.

## Recursos y límites

Cada microVM se aprovisiona con:

| Recurso | Request | Limit |
|---|---|---|
| CPU | 200m | 1 vCPU |
| RAM | 512 Mi | 2 GiB |
| Disco | — | 20 GiB (PVC block-mode) |

CPU y RAM son los límites máximos del microVM; el uso real suele estar muy por debajo. El disco es persistente — todo lo que instales o modifiques (paquetes, archivos, configuraciones) se conserva entre reinicios. Si el disco se llena (90%+), libéralo desde la Console (`du -sh /persist/*`).

> **Límite actual**
> Actualmente cada miembro puede desplegar **1 agente microVM**. Este límite se ampliará en futuras versiones.
