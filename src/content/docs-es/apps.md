---
title: Apps
description: Despliega tus apps desde GitHub a NaN Cloud en minutos.
order: 6
group: Guías
---

# Apps.

NaN Cloud te permite **desplegar tus propias apps desde un repositorio de GitHub**: construimos tu imagen, la publicamos en tu entorno aislado y la servimos tras un dominio público con HTTPS. Todo en un clic.

> **Antes de empezar**
> Las apps viven dentro de un **Space**: tu propio entorno, con su cuota de recursos. Si tienes una suscripción de inferencia activa, tu membresía incluye **un Space Basic gratis**. Si no, puedes comprar uno en [cloud.nan.builders/spaces](https://cloud.nan.builders/spaces).

## Tiers disponibles

Cada Space pertenece a un tier. El tier define la cuota total de CPU, RAM y almacenamiento que comparten todas las apps que despliegues dentro. Puedes **subir o bajar de tier** cuando quieras desde el panel del Space (bajar solo se permite si tu consumo actual cabe en el tier nuevo).

| Tier | CPU | RAM | Disco | Pods | Precio |
|---|---|---|---|---|---|
| Basic | 2 vCPU | 4 GiB | 20 GiB | 5 | Gratis con inferencia · 6 € al mes |
| Medium | 4 vCPU | 8 GiB | 40 GiB | 10 | 12 € al mes |
| Large | 4 vCPU | 16 GiB | 80 GiB | 20 | 24 € al mes |

La CPU y la RAM son los **límites agregados del Space** (la suma de todas tus apps). Por defecto, cada app que creas arranca con un límite holgado de `500m` de CPU y `500 MiB` de RAM, suficiente para una API o un worker típicos; puedes subir el límite por app desde la sección *Opciones avanzadas* del formulario hasta agotar el tier. El disco se comparte mediante PVCs (5/10/20 según el tier) y solo lo consumen las apps que marques como *persistentes*.

## 1. Crea un Space

Entra en [cloud.nan.builders/spaces](https://cloud.nan.builders/spaces). Si eres miembro de inferencia verás un panel que te ofrece un Space Basic gratis: elige un *slug* (de 1 a 20 caracteres, en minúscula y sin espacios) y pulsa **Claim free Basic**. Ese slug se usará para construir los dominios públicos de tus apps, así que elígelo con cabeza.

![Reclamar un Space Basic gratis](/docs/apps/01-claim-free-space.png)

El Space se activa al instante.

## 2. Crea una App dentro del Space

Abre el Space que acabas de crear. Verás el resumen de consumo de recursos, el botón **Change plan** por si quieres subir de tier en algún momento, y la sección **Apps in this Space**. Pulsa **New App** para empezar el formulario.

![Crear una App nueva dentro del Space](/docs/apps/02-space-new-app.png)

## 3. Conecta GitHub y configura la build

Conecta tu cuenta de GitHub autorizando la GitHub App de NaN Cloud en el repositorio que quieras desplegar (la primera vez te lleva al flujo de instalación oficial en github.com). Una vez conectado, elige el repo de la lista, la rama, y dale un nombre a tu App.

> **Requisito obligatorio: Dockerfile**
> Tu repositorio **tiene que contener un `Dockerfile`** en la raíz (o en la ruta que configures). Sin Dockerfile no podemos construir tu imagen y la app no se desplegará. A cambio, tienes control total sobre el runtime, las dependencias y los procesos que arrancan dentro de tu app.

Si tu app es un servicio HTTP (una web, una API, un panel de administración, etc.), marca **Expose over HTTP** e indica el **puerto** en el que escucha internamente. Por ejemplo, si arrancas con `node server.js` escuchando en `:8080`, pon `8080` aquí. Del resto nos encargamos nosotros: publicarla en un dominio público con HTTPS.

Si tu app es un proceso que no necesita ser accesible desde fuera (un worker, un cron, un consumidor de cola, etc.), desmarca *Expose over HTTP*: la app arrancará en modo worker, sin URL pública.

![Formulario de creación de App: GitHub, Dockerfile y puerto](/docs/apps/03-new-app-form.png)

El bloque **Environment variables** (opcional) te permite añadir variables tanto de runtime como de build. Y en **Advanced options** puedes ajustar réplicas, CPU y memoria, y añadir almacenamiento persistente si tu app necesita guardar estado.

Pulsa **Deploy**. En la pantalla de detalle de la App verás la build en tiempo real. Al terminar, si todo ha ido bien, el estado cambiará a `Running`.

## 4. Abre tu App

Cuando el estado sea `Running`, pulsa el botón **Open** de arriba a la derecha. Abre la URL pública de tu app en una pestaña nueva.

![App en estado Running con el botón Open](/docs/apps/04-app-running.png)

Desde esa misma pantalla tienes acceso a los logs en vivo de tu app, a los eventos, a las métricas (CPU, memoria, disco), a la gestión de variables de entorno y a un panel de ajustes para cambiar sobre la marcha la rama, el Dockerfile, el puerto y los recursos.

## 5. Tu app, en producción

Ya está. Tu repositorio de GitHub está sirviendo tráfico real desde un dominio público con HTTPS, sobre nuestra infraestructura. Cada `git push` a la rama configurada (con el auto-deploy activado) dispara una build nueva automáticamente.

![Ejemplo de una App desplegada y sirviendo](/docs/apps/05-app-example.png)

> **Tu App está en marcha.**
> Con estos 5 pasos ya tienes tu app desplegada. Si necesitas escalar (más recursos, más réplicas, almacenamiento persistente, o más Spaces para separar entornos de dev, staging y producción), puedes hacerlo cuando quieras desde el panel. Apps y Spaces están en **Beta**: si encuentras algún problema, repórtalo en `#support` de Discord.
