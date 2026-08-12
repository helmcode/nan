---
title: Agentes
description: "Despliega agentes de IA en una microVM aislada con QEMU: Hermes, terminal web, subida de ficheros y observabilidad."
order: 5
group: Guías
---

# Agentes.

NaN Cloud te permite desplegar agentes de IA en tu propia **microVM**: una máquina virtual ligera con QEMU y KVM, con su propio kernel, su propio sistema de ficheros y acceso root completo. Aislada del host y del resto de miembros. El primer tipo de agente disponible es **Hermes**.

> **¿Usas un agente que alojas tú?**
> Si ejecutas tu propio agente compatible con MCP en otro sitio, puedes enchufarle nuestras herramientas (como la búsqueda web) directamente, con la misma API key, a través de nuestro [servidor MCP](/es/docs/api#tag/mcp) remoto.

## Arquitectura

Cada agente corre dentro de su propia microVM de QEMU. En vez de compartir el kernel del host (como haría un contenedor normal), arranca con su propio kernel de Linux. La VM monta un disco ext4 de 20 GiB sobre un volumen persistente en modo bloque. Todo lo que hagas dentro (`apt install`, `pip install`, cambios en `/etc`, ficheros que subas) vive en ese disco y sobrevive a los reinicios.

El apagado es *limpio*: cuando reinicias o borras el agente, el sistema fuerza un `sync` y espera a que el journal de ext4 termine de volcarse antes de matar la VM. Sin corrupción.

## Hermes

Hermes es un agente de IA conversacional que se conecta a Telegram. Puedes chatear con él, pedirle que gestione notas, que ejecute comandos en su entorno, que genere webs y bastante más.

### 1. Crea un bot de Telegram

Necesitas un bot de Telegram. Abre Telegram, busca [@BotFather](https://core.telegram.org/bots/tutorial#obtain-your-bot-token) y sigue las instrucciones para crear uno nuevo. Copia el token que te dé.

### 2. Crea el agente

Entra en [cloud.nan.builders/agents/new](https://cloud.nan.builders/agents/new) y rellena: nombre, tipo (Hermes), el token de Telegram, el modelo y, opcionalmente, un *soul* (system prompt) que defina la personalidad de tu agente.

![Formulario de creación de agente](/docs/agents/create-agent-form.png)

### 3. Espera a que esté Running

Después de crear el agente, espera unos 30 segundos a que arranque la microVM, se formatee el disco por primera vez (`mkfs.ext4`) y se siembre el sistema de ficheros. El estado pasa a `Running` y Hermes a `Ready`.

### 4. Habla con tu agente

Busca tu bot en Telegram y mándale un mensaje. Hermes responderá con el modelo que hayas configurado.

![Conversación con Hermes en Telegram](/docs/agents/telegram-hermes-chat.jpg)

> **Tu agente está listo.**
> Con estos 4 pasos ya tienes Hermes funcionando. Lo que viene a continuación son funciones adicionales del panel del agente: terminal web, subida de ficheros, observabilidad, exposición HTTP, la UI de Hermes y la gestión de variables de entorno.

## Console: terminal web

La pestaña **Console** abre una terminal interactiva (`bash --login`) dentro de tu microVM, sin necesidad de configurar SSH. El stream va por WebSocket con xterm.js: se redimensiona sola al ajustar el panel, tiene una pastilla de estado arriba a la derecha y un botón de reconexión por si se cae la sesión.

Casos de uso típicos:

- Instalar paquetes: `apt update && apt install -y nginx`
- Revisar los logs internos del agente
- Mover a su sitio los ficheros que hayas subido
- Usar `htop`, `df -h`, `journalctl`, etc.

> **Límites operativos**
> 1 sesión simultánea por agente · 10 min de timeout por inactividad · 30 min de duración máxima por sesión.

## Files: subida de ficheros

La pestaña **Files** permite subir ficheros a la microVM arrastrándolos o desde el selector. Admite varios a la vez, con cola secuencial y barra de progreso en vivo con MiB/s. Los ficheros aterrizan en `/persist/uploads/` y desde ahí puedes moverlos con la Console.

- Tamaño máximo: **200 MiB** por fichero.
- Transporte: WebSocket con trozos de 256 KiB y backpressure de extremo a extremo.
- El nombre del fichero se sanea en servidor (sin path traversal).
- Listado en vivo de los ficheros subidos (se refresca cada 5s).

## Observabilidad

La pestaña **Observability** agrupa tres sub-pestañas:

- **Logs**: stream en vivo del stdout y stderr del agente por WebSocket. Búfer de las últimas 500 líneas en el cliente.
- **Events**: eventos del Pod de Kubernetes (BackOff, Scheduled, Pulled, Killing...) con tipo, motivo, mensaje, antigüedad y recuento. Se refresca solo cada 15s.
- **Metrics**: consumo real de CPU, RAM y disco frente a los límites configurados. CPU y RAM vía Prometheus (kubelet-cadvisor), disco con `df` dentro de la microVM (el sistema de ficheros es de modo bloque y kubelet no lo ve). Se refresca cada 10s.

## Web: exposición pública

La pestaña **Web** tiene dos sub-pestañas para exponer servicios HTTP del agente:

### HTTP

Cualquier servicio que tu agente sirva por HTTP (nginx, una API, un sitio estático) lo puedes exponer públicamente. Por ejemplo, pídele a Hermes que instale nginx con una página HTML propia:

![Pidiendo a Hermes que instale nginx con una página HTML propia](/docs/agents/telegram-nginx-setup.jpg)

En la pestaña **Web → HTTP**, pulsa **Enable HTTP**. Por defecto se expone el puerto `80`; si tu servicio escucha en otro, indícalo en **Container Port**. La plataforma genera una URL pública en `*.apps.nan.builders`.

![Web generada por Hermes vista desde la URL pública](/docs/agents/http-result.png)

### La UI de Hermes

Hermes incluye una UI web ligera ([nesquena/hermes-webui](https://github.com/nesquena/hermes-webui)) que corre siempre dentro del agente. Desde **Web → Hermes UI** puedes activar el acceso externo: la plataforma genera una URL del tipo `webui-<agente>-<usuario>.apps.nan.builders`, protegida por una contraseña por agente que se muestra en el panel.

## Variables de entorno

La pestaña **Env** te permite añadir, editar y borrar variables de entorno del agente sin tocar el Deployment. Útil para inyectar API keys de terceros, configurar el comportamiento de Hermes, etc.

Hay dos variables **protegidas** (solo se pueden editar, no borrar): `OPENAI_API_KEY` (tu key del clúster, que gestiona la plataforma) y `TELEGRAM_BOT_TOKEN`. El resto las puedes crear, editar o borrar libremente.

## Recursos y límites

Cada microVM se aprovisiona con:

| Recurso | Request | Límite |
|---|---|---|
| CPU | 200m | 1 vCPU |
| RAM | 512 Mi | 2 GiB |
| Disco | (sin request) | 20 GiB (PVC en modo bloque) |

La CPU y la RAM son los límites máximos de la microVM; el consumo real suele quedar muy por debajo. El disco es persistente: todo lo que instales o modifiques (paquetes, ficheros, configuraciones) se conserva entre reinicios. Si el disco se llena (por encima del 90%), libéralo desde la Console (`du -sh /persist/*`).

> **Límite actual**
> Ahora mismo cada miembro puede desplegar **1 agente en microVM**. Este límite se ampliará en versiones futuras.
