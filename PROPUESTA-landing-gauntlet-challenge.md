# Propuesta — Landing del Gauntlet Challenge

> Documento vivo. Fuente actual: `NaN_Gauntlet_Agosto_2026.pptx` (15 slides + notas del ponente)
> y la captura de "Entrega mínima". Se irá ampliando con el resto de mensajes.
>
> Ruta propuesta: `/gauntlet` (EN) · `/es/gauntlet` (ES)
> Estado: borrador para revisión — hay 4 decisiones abiertas (ver §7).

---

## 1. Qué es el evento (resumen de la fuente)

El **Gauntlet** es la temporada de agosto de NaN: dos eventos encadenados bajo un mismo
concepto, el **Gauntlet Loop**.

| | |
|---|---|
| **Gauntlet Workshop** | Viernes 7 de agosto. Kickoff pedagógico: qué es el Gauntlet Loop, por qué funciona, ejemplos de lo que ya se puede construir. Termina abriendo oficialmente el challenge. Ponente: `@sahul_125`. |
| **Gauntlet Challenge** | Del 8 de agosto al **28**. Participación abierta a miembros. Hay **formulario de inscripción, abierto todo el tiempo hasta el cierre** (28 ago): no hay ventana que se cierre antes, así que nadie se queda fuera por llegar tarde. Construyes, publicas y actualizas tu entrega hasta ese día. |
| **Votaciones** | Desde el 28 de agosto, unos días. Vota la comunidad. |
| **Día de presentaciones** | Fecha por concretar — se busca un día que le venga bien a todo el mundo. Presentan **los proyectos más votados**. |

**La idea clave (slide 6):** un prompt no hace todo el trabajo — activa un sistema autónomo
que construye, observa, critica y corrige. La ventaja no está en "pensar más", sino en
cerrar el bucle con feedback observable.

```
Objetivo → Builders → Críticos → Evidencia → Iteración ⟲
```

**Por qué funciona (slide 7):** el crítico necesita **pruebas, no opiniones**. Inspecciona
artefactos reales — capturas (compara el resultado visual), tests (verifica funcionalidad),
métricas (mide rendimiento y coste). Si el resultado supera la referencia se acepta e
integra; si no, vuelve al builder. El feedback externo reduce la autocorrección complaciente.

**La lección del experimento (slide 8):** más agentes no significan mejores resultados.
Paraleliza lo independiente (luz · materiales · color), pero deja **un solo responsable**
para los sistemas acoplados (armas · sonido · enemigos). El Gauntlet no es "crear cien
agentes": es diseñar bien la propiedad del trabajo.

---

## 2. Estructura de la landing

Se respeta el patrón visual de `/events` y `/projects`: secciones numeradas con `sechead`
(`01`, `02`…), título grande con `caret-type`, eyebrow en mono minúsculas, acento violeta,
cero Tailwind (CSS scoped en el `<style>` de la página).

### `00` HERO

```
// gauntlet challenge                          ← eyebrow mono
GAUNTLET
CHALLENGE._                                    ← caret-type, violeta en la 2ª línea
Un prompt. Un sistema que construye, critica y se corrige solo.
Construye hasta el 28 de agosto. Después vota la comunidad.

[ Cuenta atrás / estado ]   Aug 8 – 28 · 2026

[ Ver el reto ]  [ Únete a la comunidad ]
```

- **Countdown vivo**: mismo criterio que el calendario de `/events` — la página es SSR
  (no prerenderizada), así que puede calcularse en el Worker. Tres estados: *empieza en
  N días* → *quedan N días para el cierre* → *cerrado*.
- Chip mono con el rango, formateado con `spanLabel()` de `src/lib/agenda.ts` para que
  coincida exactamente con la fila de la agenda ("Aug 8 – 31" / "8-31 ago").

### `01` LA IDEA — el Gauntlet Loop

Diagrama de 5 pasos en tira horizontal, reutilizando la estética de la tira del calendario
(celdas con borde `--color-line`, número en mono violeta, etiqueta en serif):

| 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|
| Objetivo | Builders | Críticos | Evidencia | Iteración |

Cierre de sección, destacado: *"La ventaja no está en «pensar más», sino en cerrar el bucle
con feedback observable."*

Nota importante que pide la fuente (notas del slide 6): aclarar que **"un solo prompt"
significa una instrucción humana inicial**, no una sola llamada ni un único agente.

### `02` QUÉ HACE QUE FUNCIONE — el crítico necesita pruebas

Tres tarjetas (grid de 3, colapsando a 1 en móvil), mismo `vcard` sin la parte de vídeo:

- **Capturas reales** — compara el resultado visual
- **Tests** — verifica funcionalidad
- **Métricas** — mide rendimiento y coste

Debajo, el gate en dos ramas, tratado como un bloque mono tipo terminal:

```
¿el resultado supera la referencia?
  NO  →  vuelve al builder
  SÍ  →  acepta e integra
```

### `03` CÓMO SE DISEÑA — paralelizar vs. responsable único

Dos columnas enfrentadas (split 50/50 con línea vertical `--color-line` en medio):

| PARALELIZA lo independiente | UN SOLO RESPONSABLE para lo acoplado |
|---|---|
| Luz · materiales · color | Armas · sonido · enemigos |

Cierre: *"El Gauntlet no es «crear cien agentes»; es diseñar bien la propiedad del trabajo."*

### `04` CALENDARIO — agosto es una temporada, no un día

Timeline de 4 hitos. Visualmente, la fila de agenda de `/events` (`agenda__row`) ya resuelve
esto: fecha mono violeta + badge + título. Se reutiliza el patrón, marcando el hito activo
según la fecha del servidor.

| Fechas | Hito |
|---|---|
| **7 ago** | Workshop + kickoff |
| **8 – 27 ago** | Construcción y checkpoints · inscripción abierta |
| **28 ago** | Cierre: última hora para inscribirse y entregar |
| **desde el 28** | Votaciones de la comunidad, unos días |
| **por concretar** | Día de presentaciones — presentan los más votados |

Pie de sección: *"Experimentación libre durante el mes · una única ejecución final comparable."*
El calendario existe para que la actividad no se concentre en la última semana y para
mantener las entregas comparables.

**El último hito no tiene fecha, y eso hay que decirlo tal cual.** Se busca un día que le
venga bien a todo el mundo, así que en la landing va como "fecha por confirmar — se anuncia
en Discord", no como un hueco vacío ni con una fecha inventada. Cuando se cierre, es un
cambio de una línea en `i18n` (y una entrada nueva en `eventos.json` para que salga en el
calendario de `/events`).

> **Ojo con el copy heredado del deck.** La presentación original decía "28–29 run oficial +
> entrega" y "30–31 galería + Demo Day". Eso queda **sustituido** por el calendario de
> arriba: el 28 se cierra todo, después votan y el día de presentaciones se cuadra. Las
> reglas del run oficial (§`07`) siguen vigentes; lo que cambia son las fechas.

### `05` CÓMO PARTICIPAR — entrar, construir y publicar sin pedir permiso

Tira de 5 pasos: **Descubre el reto → Construye → Publica → Actualiza → Marca final**.

Bloque de requisitos, en caja con borde violeta (mismo tratamiento que `hack__when`):

- Ser miembro de NaN
- Usar modelos abiertos disponibles en NaN
- Documentar el loop y la intervención humana
- Entregar antes del 28 de agosto

**Inscripción: siempre abierta.** El formulario no tiene ventana de cierre anticipado —
sigue abierto hasta el día del cierre (28 de agosto). Es intencionado: la fuente insiste
en que nadie se quede fuera por llegar tarde, y el calendario existe para repartir la
actividad, no para levantar una puerta. Una submission por proyecto, editable hasta el cierre.

La inscripción se hace en un **Google Form** (4 campos, medio minuto). En esta sección va el
botón que lleva a él, con aviso de que abre en otra pestaña. No se incrusta en la página:
un iframe de Google dentro de un tema oscuro se ve como lo que es, un injerto. Detalle en §6.

### `06` LA ENTREGA — obligatorio vs. recomendado

**Obligatorio** — 8 campos, en grid de 2 columnas (así aparecen en la fuente):

| | |
|---|---|
| Nombre + descripción | Modelo utilizado |
| Portada 16:9 | Arquitectura del loop |
| Repositorio | Intervención humana |
| **Prompt inicial** | **Resultado + aprendizajes** |

> Los dos últimos van destacados en la fuente (fondo verde en el original → aquí, violeta):
> son los que prueban *qué se construyó y cómo*.

**Recomendado** — lo que convierte una demo en un experimento útil:

| Campo | Para qué |
|---|---|
| Vídeo | Demuestra el resultado |
| Demo | Permite probarlo |
| Baseline vs. final | Hace visible la mejora |
| Tokens y tiempo | Explica el coste |
| Logs y trazas | Permite auditar |
| Diagrama | Aclara la arquitectura |

Regla de una línea, en mono: **la imagen es obligatoria · el vídeo es recomendado · la demo
pública es opcional.**

Dos notas de la fuente que conviene que aparezcan como letra pequeña (no ocultas):

- **Repositorio**: puede permanecer privado durante agosto, pero debe abrirse al cierre —
  o compartirse con la organización para poder verificarlo.
- **Vídeo**: no se aloja. Se admite URL de YouTube, Loom o similares.

### `07` REGLAS DE LA EJECUCIÓN OFICIAL

La sección con más peso visual: 4 números grandes en mono, tipo scoreboard.

| | |
|---|---|
| **1** | run evaluable |
| **12 h** | duración máxima |
| **FIJO** | presupuesto de tokens |
| **0** | dirección humana |

Pie: *Logs completos desde el inicio · recuperación técnica declarada · resultado reproducible.*

Aviso destacado (lo pide explícitamente la nota del slide 14): **estas reglas aplican solo
al run evaluable**. Antes, durante todo el mes, se puede experimentar tantas veces como haga
falta. El objetivo es comparar sistemas, no presupuestos infinitos.

### `08` DESPUÉS DEL CIERRE — vota la comunidad, presentan los mejores

Tres pasos, misma tira horizontal que las demás secciones:

| 1 | 2 | 3 |
|---|---|---|
| **28 ago** — se cierra la entrada | **Votaciones** — vota la comunidad, unos días | **Presentaciones** — presentan los más votados |

Copy de la sección: *"El challenge no lo cierra un jurado. Lo entregado se enseña, la
comunidad vota y los proyectos más votados se presentan en directo."*

Chip de estado para el día de presentaciones: **fecha por confirmar**, con la razón dicha
en voz alta — *"buscamos un día que le venga bien a todo el mundo; se anuncia en Discord."*
Es mejor eso que un "próximamente" hueco: explica el porqué y da una razón para estar en
Discord.

**Esta sección es puro anuncio.** No hay votación construida ni la habrá en esta entrega
(§6): la mecánica se explica y el destino es Discord. Por eso el bloque no lleva botón de
votar — lleva enlace al Discord, que es donde va a pasar. Cuando exista backend, este es el
sitio donde entra la votación real sin mover nada más de la página.

### `09` CTA FINAL

- Primario: **Apúntate al challenge** → el Google Form (§6), en pestaña nueva.
- Secundario: **Únete a la comunidad** → `/community`, para quien todavía no es miembro.
- Terciario: enlace al workshop del 7 de agosto y al Discord.

Recordatorio de estado: mientras la inscripción esté abierta —es decir, hasta el 28 de
agosto— el CTA primario nunca cambia a "cerrado". A partir del 28 pasa a "Vota", y cuando
acabe la votación, a "Ver la galería".

---

## 3. Copy — EN / ES

Todo el texto va a `i18n/{en,es}.json` bajo una clave nueva `nan.gauntlet`. Los nombres
propios ("Gauntlet Challenge", "Gauntlet Loop") **no se traducen** — igual que en
`eventos.json`, donde el título del challenge es un `string` plano y no un par `{en, es}`.

| Clave | EN | ES |
|---|---|---|
| `heroEyebrow` | `// gauntlet challenge` | `// gauntlet challenge` |
| `heroTitle1` | Gauntlet | Gauntlet |
| `heroTitle2` | Challenge. | Challenge. |
| `heroSub` | One prompt. A system that builds, critiques and corrects itself. Build until August 28 — then the community votes. | Un prompt. Un sistema que construye, critica y se corrige solo. Construye hasta el 28 de agosto. Después vota la comunidad. |
| `voteTitle` | The community picks who presents. | La comunidad elige quién presenta. |
| `voteSub` | No jury. What you ship gets shown, the community votes, and the most-voted projects present live. | Sin jurado. Lo entregado se enseña, la comunidad vota y los proyectos más votados se presentan en directo. |
| `demoDayTbd` | Date to be confirmed — we're looking for a day that works for everyone. Announced on Discord. | Fecha por confirmar — buscamos un día que le venga bien a todo el mundo. Se anuncia en Discord. |
| `loopLabel` | the key idea | la idea clave |
| `loopTitle` | A prompt doesn't do the work. | Un prompt no hace el trabajo. |
| `loopSub` | It fires up an autonomous system that builds, observes, critiques and corrects. | Activa un sistema autónomo que construye, observa, critica y corrige. |
| `loopNote` | "One prompt" means one initial human instruction — not one call, not one agent. | "Un prompt" es una instrucción humana inicial, no una sola llamada ni un único agente. |
| `proofTitle` | The critic needs proof, not opinions. | El crítico necesita pruebas, no opiniones. |
| `designTitle` | More agents doesn't mean better results. | Más agentes no significa mejores resultados. |
| `calTitle` | August is a season, not a day. | Agosto es una temporada, no un día. |
| `joinTitle` | Build and publish. No permission needed. | Construye y publica. Sin pedir permiso. |
| `submitTitle` | What you submit has to prove what you built, and how. | Lo obligatorio debe probar qué se construyó y cómo. |
| `runTitle` | Compare systems, not infinite budgets. | Comparar sistemas, no presupuestos infinitos. |

*(tabla parcial — el resto se genera al implementar, con la misma estructura anidada que
`nan.events`)*

---

## 4. Cómo encaja con lo que ya existe

### Ficheros a tocar

| Fichero | Cambio |
|---|---|
| `src/pages/_gauntlet.astro` | **Nuevo.** El cuerpo: marcado + CSS scoped. Layout `NanPage`. |
| `src/pages/gauntlet.astro` | **Nuevo.** Wrapper EN de 3 líneas. |
| `src/pages/es/gauntlet.astro` | **Nuevo.** Wrapper ES de 3 líneas. |
| `i18n/en.json` · `i18n/es.json` | Bloque `nan.gauntlet` con todo el copy. |
| `src/data/eventos.json` | Añadir `"href": "/gauntlet"` a la entrada del challenge. |
| `src/lib/agenda.ts` | `href?: string` en `AgendaItem`. |
| `src/pages/_events.astro` | Envolver `agenda__title` en `<a>` cuando la entrada tenga `href`. |
| `src/pages/sitemap.xml.ts` | `/gauntlet` al array `BILINGUAL`. |
| `src/tests/lib/sitemap.test.ts` | Cubrir la ruta nueva en los dos idiomas. |
| `src/tests/landing/eventsData.test.ts` | Validar que `href`, si existe, es una ruta interna. |
| `src/components/nan/StructuredData.astro` | Ampliar el union `page` con `'gauntlet'` y emitir JSON-LD `Event`. |

### Reglas del repo que aplican

1. **El wrapper `_` es obligatorio.** Una ruta no puede importar otra ruta: Astro atribuye
   el CSS por entrypoint y la página saldría **sin `<link rel="stylesheet">`**. Lo guarda
   `src/tests/pages/routeWrappers.test.ts`.
2. **El idioma va en el path**, no en query param. `getLang(Astro.url)` dentro del cuerpo;
   los dos wrappers no duplican ni marcado ni copy.
3. **Sin Tailwind** en las páginas del rediseño: CSS scoped con los tokens
   (`--color-violet`, `--color-line`, `--space-*`, `--font-mono`, `--font-serif`).
4. **Datos reales o nada.** Si una cifra no está cerrada (premio, presupuesto), no se
   inventa: o se omite la sección o se marca como "por anunciar".
5. **O entra en el sitemap, o va con `noindex`.** No se declara indexable algo a lo que
   solo se llega escribiendo la URL. Como la landing sí se enlazará desde `/events`, entra
   en `BILINGUAL`.
6. **Sin barra final** en las rutas internas (`withLang` ya lo respeta).

### Nav

No se propone entrada permanente en la Nav: es un evento con fecha de caducidad, y la Nav
ya tiene 6 enlaces. La entrada natural es la fila de la agenda en `/events`, que hoy es
texto muerto — hacerla clicable es el cambio de mayor retorno del lote.

---

## 5. Comportamiento por estado

La página es SSR, así que el estado se resuelve en el servidor con la fecha real. Tres
modos, y el hero y el CTA cambian con ellos:

| Estado | Cuándo | Hero | CTA |
|---|---|---|---|
| `pre` | antes del 8 ago | "Empieza en N días" | Apúntate al challenge |
| `live` | 8 – 28 ago | "Quedan N días para el cierre" | Apúntate al challenge |
| `votacion` | desde el 28 ago | "Vota los proyectos" | Vota |
| `closed` | al acabar la votación | "Edición cerrada" | Ver la galería |

El botón al Google Form está visible en `pre` y en `live` — los dos estados en los que la
inscripción está abierta. En `votacion` se sustituye por el enlace a Discord, y en `closed`
por un aviso de edición cerrada.

Como no hay backend (§6), el estado **solo cambia texto y enlaces**: no habilita ni
deshabilita nada. Es la ventaja de una página de anuncio — el estado es cosmético y no puede
dejar a nadie fuera por un error de zona horaria.

El paso de `votacion` a `closed` **no tiene fecha fija** (la votación dura "unos días" y el
día de presentaciones se cuadra sobre la marcha). Para no depender de un cálculo que nadie
puede escribir todavía, la fecha de fin de votación va como un valor editable en
`eventos.json`, no cableada en el código.

Mismo aviso que ya está comentado en `_events.astro`: el reloj es el del Worker (UTC), así
que cerca de medianoche en Canarias o LATAM el contador puede ir un día adelantado.

---

## 6. Alcance: qué es landing y qué es producto

**La landing es una página de anuncio. No guarda un solo dato.**

Esa es la decisión de alcance de esta primera entrega, y viene de una restricción real: no
tenemos acceso al backend cloud-api, que es donde vive todo el dato de miembros. Persistir
inscripciones, entregas o votos exige a la gente de NaN, y eso llega después. Construir
almacenamiento paralelo (una D1 nuestra, un webhook) para luego migrarlo sería trabajo tirado.

Así que de las seis piezas del MVP de la fuente (slide 11), esta entrega cubre una:

| Pieza | En esta entrega |
|---|---|
| **Landing del challenge** | ✅ se construye |
| Inscripción | ➡️ **Google Form externo**, enlazado desde la landing |
| Formulario de entrega | 📣 solo se **anuncia** — se construye cuando haya backend |
| Votación | 📣 solo se **anuncia** — se construye cuando haya backend |
| Galería pública | ❌ producto |
| Página de proyecto | ❌ producto |
| Panel de administración | ❌ producto |
| Starter repo + documentación | ❌ fuera de la web |

**Anunciar sin construir tiene una regla:** cada pieza que se menciona pero no existe lleva
al lado **dónde va a ocurrir de verdad** — Discord, en la práctica. Nada de botones muertos,
nada de "próximamente" sin destino. Una promesa sin puerta es peor que no mencionarla.

### Inscripción — Google Form

Cuatro campos y nada más:

| Campo | Obligatorio | Notas |
|---|---|---|
| Nombre | ✅ | Nombre de la persona, texto libre |
| Usuario de Discord | ✅ | Es la identidad real dentro de NaN; sin él no hay forma de contactar |
| Correo de NaN | ✅ | El de la cuenta de miembro — sirve de comprobación de pertenencia |
| Qué quieres construir | ❌ | Texto libre, corto. Da señal para los checkpoints y el kickoff |

Vive **fuera de la web**: las respuestas caen en una hoja de cálculo, que es exactamente lo
que hace falta para un evento de un mes. La landing solo pone un botón que lleva allí.

Consecuencias, y no son menores:

- **No hay isla Preact, ni endpoint, ni validación en el edge.** La página se queda con cero
  JavaScript propio, como el resto de páginas del rediseño.
- **No hay binding de base de datos que declarar** en `wrangler.jsonc`. Nada que desplegar
  más allá del HTML.
- **La estética del formulario no será la de la web.** Es el precio, y por eso el botón debe
  avisar de que se abre un Google Form: un salto de dominio inesperado se lee como error.
- **La URL del formulario va en `i18n`**, no incrustada en el marcado, para poder cambiarla
  sin tocar la página.

### Cuando haya backend

Lo que hoy se anuncia es lo que entonces se construye: formulario de entrega, votación,
galería y panel. La nota de la fuente apunta a que **reutilizar login, perfiles y galería
existentes reduce el scope** — y en esta web ya existen las cinco pantallas de `/hackaton`
(login, `/me`, submission, leaderboard, projects) hablando con cloud-api. Es el precedente
más cercano y el sitio por donde empezar a mirar.

> **Inscripción ≠ entrega.** La inscripción son 4 campos en un Google Form y ocurre una vez.
> La entrega son los 8 campos obligatorios de `06` y llega al final, por un canal que
> todavía no existe. Confundirlas en el copy es el error más fácil de cometer aquí.

---

## 7. Decisiones abiertas (bloquean copy final)

La propia presentación cierra pidiendo aprobación del MVP y de cuatro decisiones. Hasta que
se cierren, la landing no puede afirmarlas:

1. **El reto concreto** — qué se construye. Hoy no hay tema definido.
2. **La rúbrica** — cómo se evalúa. Ahora hay dos capas: el voto de la comunidad decide
   quién presenta, pero sigue sin estar claro qué convierte a un run en "evaluable".
3. **El presupuesto de tokens** — la fuente dice "FIJO", pero no la cifra.
4. **Los premios** — sin definir.

**De la votación y el día de presentaciones, por cerrar:**

- **Cuántos días dura la votación** y, por tanto, cuándo acaba. Sin eso el estado `votacion`
  no sabe cuándo pasar a `closed`.
- **Cuántos proyectos presentan.** "Los más votados" no es un número: ¿tres, cinco, los que
  pasen de X votos?
- **Quién vota** — cualquier miembro de NaN, solo los que hayan entregado, un voto por
  persona o varios. Cambia el copy y, si se construye la votación en la web, el modelo.
- **Dónde se vota.** Si es en Discord (una reacción, un canal), la landing solo enlaza y no
  hay nada que construir. Si es en la web, es una pieza de producto nueva, con auth.
- **La fecha del día de presentaciones.** Por definición no la vas a tener al publicar: por
  eso va como "fecha por confirmar" y no como hueco.

**Propuesta de manejo:** que la landing salga ya con lo que sí está cerrado (concepto,
calendario, requisitos, entrega, reglas del run) y que estos cuatro vivan en una sección
`09 por cerrar` con tratamiento explícito de "se anuncia en el kickoff del 7 de agosto".
Es honesto, evita bloquear la publicación y da una razón para volver a la página.

**Además, a confirmar:**

- ~~¿Dónde se persisten las inscripciones?~~ **Resuelto:** Google Form → hoja de cálculo. Sin
  acceso al backend cloud-api no se persiste nada en la web (§6).
- **¿Por dónde se entrega, mientras no haya formulario de entrega?** Es la consecuencia
  directa de no construirlo: alguien tiene que recibir esos 8 campos el 28 de agosto. Un
  canal de Discord con formato fijado es lo más barato, pero hay que decidirlo **antes de
  publicar**, porque la sección `06` tiene que decir dónde.
- **¿Inscribirse es requisito para entregar?** El deck decía "sin inscripción obligatoria" y
  ahora hay formulario. Son compatibles —el formulario está siempre abierto, así que nunca
  es una puerta que se cierra— pero el copy tiene que decir una de las dos cosas:
  *"apúntate para que te sigamos la pista"* o *"apúntate para poder entregar"*. Ahora mismo
  el documento asume la **primera**.
- ¿La landing debe ser bilingüe desde el día 1? La comunidad es hispanohablante y el deck
  está en español, pero el resto del sitio es bilingüe y los tests de paridad lo asumen.

---

## 8. Pendiente de tus siguientes mensajes

Espacio reservado para la información que aún vas a enviar. Se integrará en las secciones
de arriba y se anotará aquí qué cambió.

- [x] **Formulario de inscripción** — confirmado que sí se hace, y que está **abierto todo
      el tiempo hasta el día del cierre**. Integrado en §1, §2 (`05` y `09`), §4, §5, §6
      y §7. Sustituye al antiguo botón opcional "Me uno al challenge".
- [x] **Cierre el 28, no el 31** — inscripciones y entregas se cierran el 28 de agosto.
      Desde ahí, votaciones de la comunidad durante unos días, y los proyectos más votados
      presentan en un **día de presentaciones con fecha por concretar**, buscando uno que le
      venga bien a todo el mundo. Sustituye el "28–29 run oficial / 30–31 galería + Demo Day"
      del deck. Integrado en §1, §2 (`04`, `05`, nueva `08`, `09`), §5 y §7.
- [x] **Votación y entrega: solo se anuncian, no se construyen.** No hay acceso al backend
      cloud-api, y sin él no se pueden guardar datos — eso necesita a la gente de NaN y llega
      después. La inscripción se resuelve con un Google Form externo. La landing queda como
      página de anuncio con cero JavaScript propio: sin isla Preact, sin endpoint, sin
      binding de base de datos. Integrado en §2 (`05`, `08`, `09`), §4, §5, §6 y §7.
- [ ] _(pendiente: reto concreto, rúbrica, presupuesto, premios, mecánica de la votación,
      y por dónde se entrega el 28 de agosto)_
