---
title: Apps
description: Despliega tus aplicaciones desde GitHub a NaN Cloud en minutos.
order: 6
---

# Apps.

NaN Cloud te permite **desplegar tus propias apps desde un repositorio de GitHub**: construimos tu imagen, la publicamos en un entorno aislado tuyo y la servimos detrás de un dominio público con HTTPS. Todo en un clic.

> **Antes de empezar**
> Las Apps viven dentro de un **Space**: tu propio entorno con su cuota de recursos. Si tienes la suscripción de inferencia activa, recibes **un Space Basic gratis** incluido en tu membresía. Si no, puedes comprar uno desde [cloud.nan.builders/spaces](https://cloud.nan.builders/spaces).

## Tiers disponibles

Cada Space pertenece a un tier. El tier define la cuota total de CPU, RAM y almacenamiento que se reparte entre todas las apps que despliegues dentro de él. Puedes **subir o bajar de tier** en cualquier momento desde el dashboard del Space (la bajada solo se permite si tu uso actual cabe en el tier nuevo).

| Tier | CPU | RAM | Disco | Pods | Precio |
|---|---|---|---|---|---|
| Basic | 2 vCPU | 4 GiB | 20 GiB | 5 | Gratis con inferencia · $6 / €6 al mes |
| Medium | 4 vCPU | 8 GiB | 40 GiB | 10 | $12 / €12 al mes |
| Large | 4 vCPU | 16 GiB | 80 GiB | 20 | $24 / €24 al mes |

CPU y RAM son los **topes agregados del Space** (suma de todas tus apps). Por defecto cada app que crees arranca con un límite cómodo de `500m` CPU y `500 MiB` de RAM, suficiente para una API o worker típico; puedes subir el límite por app desde la sección *Advanced options* del formulario hasta consumir el tier completo. El disco se reparte vía PVCs (5/10/20 según tier) y solo lo usan las apps que marques como *persistent*.

## 1. Crear un Space

Entra en [cloud.nan.builders/spaces](https://cloud.nan.builders/spaces). Si eres miembro de inferencia verás un panel que te ofrece reclamar tu Space Basic gratis: elige un *slug* (entre 1 y 20 caracteres, minúsculas, sin espacios) y pulsa **Claim free Basic**. El slug se usará para construir los dominios públicos de tus apps, así que escógelo con cariño.

![Reclamar un Space Basic gratuito](/docs/apps/01-claim-free-space.png)

El Space se activa al instante.

## 2. Crear una App dentro del Space

Abre tu Space recién creado. Verás el resumen de recursos consumidos, el botón **Change plan** por si quieres subir de tier en algún momento, y la sección **Apps in this Space**. Pulsa **New App** para arrancar el formulario.

![Crear una nueva App dentro del Space](/docs/apps/02-space-new-app.png)

## 3. Conectar GitHub y configurar la build

Conecta tu cuenta de GitHub autorizando la NaN Cloud GitHub App al repositorio que vas a desplegar (la primera vez te lleva al flujo oficial de instalación en github.com). Una vez conectado, selecciona el repo de la lista, elige la rama y dale un nombre a tu App.

> **Requisito imprescindible: Dockerfile**
> Tu repositorio **debe contener un `Dockerfile`** en la raíz (o en el path que configures). Sin Dockerfile no podemos construir tu imagen y la app no se desplegará. Así tienes control total sobre el runtime, las dependencias y los procesos que arrancan dentro de tu app.

Si tu app es un servicio HTTP (página web, API, panel admin, etc.), marca **Expose over HTTP** e indica el **puerto** en el que tu app escucha internamente. Por ejemplo, si arrancas con `node server.js` escuchando en `:8080`, pon `8080` aquí. Nosotros nos encargamos de publicarla en un dominio público con HTTPS.

Si tu app es un proceso que no necesita ser accesible desde fuera (un worker, un cron, un consumer de cola...), desmarca *Expose over HTTP*: la app arrancará en modo worker, sin URL pública.

![Formulario de creación de App: GitHub + Dockerfile + puerto](/docs/apps/03-new-app-form.png)

El bloque **Environment variables** (opcional) te deja añadir variables tanto de tiempo de ejecución como de build. Y en **Advanced options** puedes ajustar réplicas, CPU/memoria y añadir almacenamiento persistente si tu app necesita guardar estado.

Pulsa **Deploy**. En la pantalla de detalle de la App verás la build en directo. Tras el build, si todo ha ido bien, verás que el estado pasa a `Running`.

## 4. Abrir tu App

Cuando el estado sea `Running`, pulsa el botón **Open** arriba a la derecha. Te abre la URL pública de tu app en una pestaña nueva.

![App en estado Running con botón Open](/docs/apps/04-app-running.png)

Desde la misma pantalla tienes acceso a los logs de tu app en directo, sus eventos, métricas (CPU, memoria, disco), gestión de variables de entorno y un panel de ajustes para mutar rama, Dockerfile, puerto y recursos en caliente.

## 5. Tu app, en producción

Y eso es todo. Tu repositorio de GitHub está sirviendo tráfico real desde un dominio público con HTTPS, sobre infra nuestra. Cada `git push` a la rama configurada (con auto-deploy activado) dispara una nueva build automáticamente.

![Ejemplo de App desplegada y servida](/docs/apps/05-app-example.png)

> **Tu App está viva.**
> Con estos 5 pasos ya tienes tu app desplegada. Si necesitas escalar (más recursos, más réplicas, almacenamiento persistente, más Spaces para separar entornos dev/staging/prod), puedes hacerlo en cualquier momento desde el dashboard. Apps y Spaces están en **Beta** — si encuentras algún problema, repórtalo en `#support` en Discord.
