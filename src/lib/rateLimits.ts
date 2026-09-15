/**
 * Single source of truth for the rate limits shown in the docs.
 *
 * Consumed by <RateLimits /> (what humans read) and by rateLimitsToMd()
 * (what /api/docs serves to the Discord bot). Keeping one module means the
 * page and the API cannot disagree, which they did: the component said
 * 60 rpm while the extractor hardcoded 100 rpm.
 *
 * Receives the env as a parameter so it can be unit-tested without runtime
 * bindings, mirroring src/lib/email.ts.
 */

export interface PerKeyRateLimits {
  requestsPerMinute: number;
  maxParallel: number;
}

export interface ModelRate {
  model: string;
  /**
   * The model's real context window and how many times a minute a member may
   * refill the whole of it. cloud-api stores the policy as these two factors
   * (`modelRateLimits`: ContextWindow, FillsPerMin) and derives the ceiling
   * from them, so this publishes the factors and derives it too.
   *
   * The previous shape was a hand-typed `label`, and all four of the labels it
   * carried were wrong. A product nobody multiplies cannot come out wrong.
   */
  contextTokens: number;
  fillsPerMinute: number;
}

/**
 * Limits for a model that is not gated by a per-minute rate but by a sliding
 * window plus an allowance per billing period. Those are the two numbers a
 * member has to plan against, so they are published as first-class rows
 * instead of a footnote.
 */
export interface WindowedModelLimits {
  model: string;
  contextTokens: number;
  fillsPerMinute: number;
  maxParallel: number;
  windowHours: number;
  windowTokens: number;
  periodCapTokens: number;
}

/**
 * Image generation, which is governed somewhere else entirely.
 *
 * It does not go through LiteLLM: cloud-api serves /v1/images itself against
 * Workers AI, so the per-key 60 rpm and 5 concurrent do not apply to it and
 * neither does anything in the tables above. Its own comment in
 * cmd/server/main.go says so in as many words. The limiter is an in-process
 * token bucket per user (`imagegen.NewRateLimiter(1, 3)`) plus a hard monthly
 * count (`imagegen.MonthlyQuota`).
 *
 * Published because the alternative is what was there before: a page that
 * quoted "20 requests per minute" for it, a number that appears nowhere in the
 * platform.
 */
export interface ImageModelLimits {
  model: string;
  requestsPerSecond: number;
  burst: number;
  monthlyRequests: number;
  maxVariants: number;
}

export interface RateLimitsConfig {
  perKey: PerKeyRateLimits;
  tokensPerMinuteByModel: ModelRate[];
  /**
   * The non-chat endpoints, which carry no per-minute limit of their own.
   * cloud-api calls them `rateLimitExemptModels` and the rate-limit hook
   * mirrors them in FALLBACK_EXEMPT_MODELS. They are published as a list
   * rather than left out, so "no limit of its own" cannot be mistaken for
   * "we forgot to write it down" - which is exactly what happened when
   * `rerank` sat here with an invented 1000 rpm.
   */
  exemptModels: string[];
  windowedModels: WindowedModelLimits[];
  imageModels: ImageModelLimits[];
}

export interface RateLimitsEnv {
  RATE_LIMIT_RPM?: string;
  RATE_LIMIT_PARALLEL?: string;
}

/**
 * Per-model tables stay here rather than in env vars: they only change when a
 * model is added or removed, which is a code change anyway.
 */
export const DEFAULT_RATE_LIMITS: RateLimitsConfig = {
  perKey: { requestsPerMinute: 60, maxParallel: 5 },
  // Every chat model the cluster serves, with the two factors cloud-api keys
  // its policy on. Mirrors `modelRateLimits` in cloud-api's usage_quota.go,
  // which the rate-limit hook mirrors again in FALLBACK_MODEL_LIMITS; the
  // three tables are required to agree and a divergence shows up as
  // intermittent 429s depending on which worker took the request.
  //
  // FillsPerMin is calibrated per model from p99.9 of measured per-member
  // usage and is deliberately NOT one shared number: the fraction of its
  // window a request uses varies about 20x, so a common value starves the
  // models with long requests. Do not flatten these to look tidy.
  tokensPerMinuteByModel: [
    { model: 'deepseek-v4-flash', contextTokens: 1_048_576, fillsPerMinute: 6 },
    { model: 'qwen3.8-flash', contextTokens: 1_048_576, fillsPerMinute: 6 },
    { model: 'glm5.3-flash', contextTokens: 1_048_576, fillsPerMinute: 11 },
    { model: 'mimo-v2.5', contextTokens: 1_050_000, fillsPerMinute: 4 },
    { model: 'qwen3.6', contextTokens: 262_144, fillsPerMinute: 12 },
    { model: 'gemma4', contextTokens: 262_144, fillsPerMinute: 4 },
  ],
  exemptModels: ['qwen3-embedding', 'rerank', 'kokoro', 'whisper'],
  // glm5.3 (premium tier) keeps its own block rather than a row in the table
  // above. It DOES carry a per-minute ceiling like every other model - the
  // same 1M window and 11 fills as glm5.3-flash - but the 4h sliding window
  // bites long before that ceiling could: 400M per 4h averages 1.67M/min
  // against a 11.5M/min ceiling, so the window is the number a member plans
  // against. The ceiling is published in the block too, because "is this
  // gated per minute?" deserves an answer and the old one, "not at all",
  // was wrong.
  //
  // These mirror the backend policy (cloud-api modelRateLimits + the token cap
  // for glm5.3) and the usage hook's window budget, which is the same set of
  // numbers the member portal publishes.
  //
  // contextTokens mirrors the backend EXACTLY: 1,048,576, raised from 500,000
  // on 2026-09-10. It equals the Novita primary's `context_size`, which
  // covers input AND OUTPUT together — so it is the provider's total budget,
  // not a servable input window: a prompt at the very top leaves no room for
  // the reply. Nothing filters for that on our side, so a caller who uses the
  // full figure gets the provider's error on a number this page publishes.
  //
  // It renders as "1M" because formatTokens rounds the display down, which is
  // the layer that should do it. Publishing a rounded 1,000,000 here instead
  // would leave the site 4.8% below the source it claims to mirror, and would
  // turn the test below from an equality into a floor. The equality is the
  // mechanism: it is what makes a backend change fail here instead of
  // shipping quietly.
  // cloud-api: imagegen.NewRateLimiter(1, 3), imagegen.MonthlyQuota = 100 and
  // imagegen.MaxVariants = 4. The monthly count is REQUESTS, not images: one
  // call asking for four variants still costs one.
  imageModels: [
    {
      model: 'flux-2-klein',
      requestsPerSecond: 1,
      burst: 3,
      monthlyRequests: 100,
      maxVariants: 4,
    },
  ],
  windowedModels: [
    {
      model: 'glm5.3',
      contextTokens: 1_048_576,
      fillsPerMinute: 11,
      maxParallel: 5,
      windowHours: 4,
      windowTokens: 400_000_000,
      periodCapTokens: 3_000_000_000,
    },
  ],
};

/**
 * Formats a token count the way every published surface writes it: 1M, 400M,
 * 3,000M. Lives here so the docs page and /api/docs cannot drift from
 * each other, which is the whole reason this module exists.
 */
export type DocsLocale = 'en' | 'es';

export function formatTokens(tokens: number, lang: DocsLocale = 'en'): string {
  // The thousands separator is the one the rest of the page uses, so the card
  // cannot read "3,000M" next to a model card that says "3.000M".
  // `useGrouping: 'always'` because es-ES leaves four-digit numbers ungrouped,
  // which would print 3000M beside a model card that already says 3.000M.
  // `maximumFractionDigits: 0` so a window of 1,048,576 prints "1M" and not
  // "1,049M". Without it the page shows a decimal comma (1,049M) next to a
  // thousands dot (3.000M) in es-ES — both correct, and confusing side by
  // side. Rounding the DISPLAY is the right layer: the published constant
  // stays equal to the backend, so the test below can keep asserting
  // equality rather than a floor.
  //
  // `roundingMode: 'floor'` because this page is read by people who have not
  // paid yet, so it must never advertise MORE than the backend allows.
  // Truncating alone is not the default: `maximumFractionDigits` ROUNDS, so
  // 1.5M would have printed "2M". Harmless at today's 1,048,576, and the
  // exact trap the member portal already guards against with Math.floor —
  // the guard belonged on the more public surface too.
  const fmt = new Intl.NumberFormat(lang === 'es' ? 'es-ES' : 'en-US', {
    useGrouping: 'always',
    maximumFractionDigits: 0,
    roundingMode: 'floor',
  });
  if (tokens >= 1_000_000) return `${fmt.format(tokens / 1_000_000)}M`;
  if (tokens >= 1_000) return `${fmt.format(tokens / 1_000)}K`;
  return String(tokens);
}

/**
 * The per-minute ceiling, derived rather than published.
 *
 * cloud-api does not store a tokens-per-minute number at all: it stores the
 * context window and how many times a minute a member may refill it, and the
 * ceiling is the product. Publishing the product as a literal is how this page
 * came to carry "1.5M tpm" for four models whose real ceilings were 6.3M, 4.2M,
 * 3.1M and 1.0M - one of them BELOW what was advertised, which is the half that
 * actually costs a member their afternoon.
 */
export function modelTokensPerMinute(m: ModelRate | WindowedModelLimits): number {
  return m.contextTokens * m.fillsPerMinute;
}

/** The label the cards and /api/docs both print for that ceiling. */
export function modelRateLabel(m: ModelRate | WindowedModelLimits, lang: DocsLocale = 'en'): string {
  return `${formatTokens(modelTokensPerMinute(m), lang)} tpm`;
}

/**
 * Which limit a member actually feels.
 *
 * Three of them apply at once and the strictest wins, which is not obvious and
 * was the one question an outside reviewer could not answer from this page:
 * `rerank` appeared to promise 1000 rpm while the key allows 60, so either the
 * page was wrong or the 1000 was unreachable. It was wrong - rerank carries no
 * per-minute limit of its own - but the hierarchy needed saying either way.
 */
export function effectiveLimitNote(lang: DocsLocale = 'en'): string {
  return lang === 'es'
    ? `El límite que notas es siempre el más estricto de los que te apliquen: el de tu ` +
        `key, el del modelo y el del endpoint. Los 60 por minuto y las 5 a la vez de la ` +
        `key se cuentan sobre todo lo que llames, así que un modelo con un techo más alto ` +
        `no te sube ese, y un endpoint sin techo propio sigue gastando el de la key.`
    : `The limit you feel is always the strictest of the ones that apply to you: your ` +
        `key's, the model's and the endpoint's. The key's 60 per minute and 5 at once ` +
        `count every call you make, so a model with a higher ceiling of its own does not ` +
        `raise them, and an endpoint with no ceiling of its own still spends the key's.`;
}

/**
 * What image generation is governed by, written once.
 *
 * The first half is the part a reader cannot guess and the page never said:
 * the API key's limits do not reach it at all.
 */
export function imageModelNote(m: ImageModelLimits, lang: DocsLocale = 'en'): string {
  if (lang === 'es') {
    return (
      `La generación de imágenes no pasa por la API de inferencia compartida, así que los ` +
      `límites de tu key no le aplican: tiene los suyos. ${m.requestsPerSecond} petición ` +
      `por segundo con un burst de ${m.burst}, y ${m.monthlyRequests} peticiones por mes ` +
      `natural. Una petición que pida varias imágenes sigue costando una, hasta ` +
      `${m.maxVariants}. Necesita membresía de inferencia; sin ella responde 403.`
    );
  }
  return (
    `Image generation does not go through the shared inference API, so your key's limits ` +
    `do not apply to it: it has its own. ${m.requestsPerSecond} request per second with a ` +
    `burst of ${m.burst}, and ${m.monthlyRequests} requests per calendar month. A request ` +
    `that asks for several images still costs one, up to ${m.maxVariants}. It needs ` +
    `inference membership; without it the answer is a 403.`
  );
}

/**
 * The window wording, written once.
 *
 * <RateLimits /> emphasizes the headline clause and /api/docs serves plain
 * text, so the sentence is split in two halves instead of being retyped on
 * each surface: the page and the Discord bot were already caught disagreeing
 * about rpm, and this is the number a premium member plans against.
 */
export function windowedModelHeadline(m: WindowedModelLimits, lang: DocsLocale = 'en'): string {
  return lang === 'es'
    ? `${formatTokens(m.windowTokens, lang)} tokens por ventana móvil de ${m.windowHours} horas`
    : `${formatTokens(m.windowTokens)} tokens per rolling ${m.windowHours} hours`;
}

/** The rest of the sentence started by windowedModelHeadline(). */
export function windowedModelBody(m: WindowedModelLimits, lang: DocsLocale = 'en'): string {
  if (lang === 'es') {
    return (
      `es el límite con el que topa antes una sesión intensiva de agente de código, ` +
      `mucho antes que la cuota. Cuando lo alcanzas, las peticiones a ${m.model} se ` +
      `rechazan hasta que la ventana avanza: es una ventana móvil, no un reinicio ` +
      `diario. El contador de la cuota vuelve a cero cuando empieza tu periodo de ` +
      `facturación, y si subes de plan a mitad de periodo esa primera cuota se ` +
      `prorratea a la parte del periodo que has pagado.`
    );
  }
  return (
    `is the limit a heavy coding-agent run reaches first, well before the allowance. ` +
    `Once you hit it, ${m.model} requests are rejected until the window slides forward: ` +
    `it is a rolling window, not a daily reset. The allowance counter goes back to zero ` +
    `when your billing period starts, and if you upgrade part-way into a period that ` +
    `first allowance is prorated to the share of the period you paid for.`
  );
}

/** Headline plus body, for the surfaces that publish it as one paragraph. */
export function windowedModelNote(m: WindowedModelLimits, lang: DocsLocale = 'en'): string {
  return `${windowedModelHeadline(m, lang)} ${windowedModelBody(m, lang)}`;
}

function parsePositiveInt(raw: string | undefined, fallback: number, varName: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    // A misconfigured var must not take the docs down, but it must be loud.
    console.warn(`[rateLimits] ignoring invalid ${varName}=${JSON.stringify(raw)}, using ${fallback}`);
    return fallback;
  }
  return n;
}

export function getRateLimitsConfig(env: RateLimitsEnv = {}): RateLimitsConfig {
  return {
    ...DEFAULT_RATE_LIMITS,
    perKey: {
      requestsPerMinute: parsePositiveInt(
        env.RATE_LIMIT_RPM,
        DEFAULT_RATE_LIMITS.perKey.requestsPerMinute,
        'RATE_LIMIT_RPM',
      ),
      maxParallel: parsePositiveInt(
        env.RATE_LIMIT_PARALLEL,
        DEFAULT_RATE_LIMITS.perKey.maxParallel,
        'RATE_LIMIT_PARALLEL',
      ),
    },
  };
}

/**
 * The rate-limit section of the OpenAPI spec, built from this same config.
 *
 * The spec (src/data/openapi.json) carries a `{{RATE_LIMITS}}` placeholder
 * instead of the numbers, and it is filled in when the spec is served. Without
 * this the numbers would be a third hardcoded copy, which is the exact failure
 * this module was written to prevent: the component and the extractor had
 * already drifted once (60 rpm against 100 rpm), and `RATE_LIMIT_RPM` is an env
 * var, so a deployed change would update /docs/models and leave /docs/api
 * publishing a number that is no longer true.
 *
 * The wording is the spec's (English, table-first, addressed to whoever is
 * about to write a client) rather than the docs page's; only the data is
 * shared, which is what has to agree.
 */
export function rateLimitsToSpecMarkdown(config: RateLimitsConfig): string {
  const tpm = config.tokensPerMinuteByModel;
  const rows = [
    '| Limit | Value |',
    '| --- | --- |',
    `| Requests per minute | ${config.perKey.requestsPerMinute} |`,
    `| Concurrent requests | ${config.perKey.maxParallel} |`,
  ];
  // One row per model, not one row listing them all. The previous version put
  // every model in a single row and took the value from `tpm[0]`, which is a
  // shape that can only be right while every model shares a number - and they
  // never did: the four it collapsed had ceilings of 6.3M, 4.2M, 3.1M and 1.0M
  // behind one printed "1.5M".
  for (const m of tpm) {
    rows.push(`| Tokens per minute (\`${m.model}\`) | ${formatTokens(modelTokensPerMinute(m))} |`);
  }
  if (config.exemptModels.length) {
    const models = config.exemptModels.map((m) => `\`${m}\``).join(', ');
    rows.push(`| Tokens per minute (${models}) | no limit of their own |`);
  }

  const out = [
    'Limits apply per API key (RPM and concurrency), not on total token volume:',
    '',
    ...rows,
    '',
    effectiveLimitNote(),
  ];

  for (const m of config.windowedModels) {
    out.push(
      '',
      `\`${m.model}\` carries a ${modelRateLabel(m)} ceiling like the others, but what ` +
        `gates it in practice is a rolling window plus an ` +
        `allowance per billing period: ${formatTokens(m.windowTokens)} tokens per rolling ` +
        `${m.windowHours} hours and a ${formatTokens(m.periodCapTokens)}-token allowance that ` +
        `returns to zero when your billing period starts. The window is rolling, not a daily ` +
        `reset. Context window: ${formatTokens(m.contextTokens)} tokens, ` +
        `${m.maxParallel} concurrent requests.`,
    );
  }

  return out.join('\n');
}

/**
 * The visible labels of the rate limits card. They live here, beside the numbers
 * they label, so a locale cannot silently fall back to the other language the
 * way it did when they were literals inside the component.
 */
export function rateLimitsLabels(lang: DocsLocale) {
  return {
  en: {
    perKey: 'rate limits per API key',
    requestsPerMin: 'Requests / min',
    maxParallel: 'Max parallel',
    concurrent: 'concurrent',
    premium: 'premium tier limits',
    window: (h: number) => `Rolling ${h}h window`,
    allowance: 'Allowance / billing period',
    context: 'Context window',
    concurrentRequests: 'Concurrent requests',
    tokensPerMin: 'Tokens / min',
    tokensPerModel: 'tokens / min per model',
    images: 'image generation',
    perSecond: 'Requests / sec',
    burst: 'Burst',
    monthlyRequests: 'Requests / month',
    maxVariants: 'Images / request',
    exempt: 'no per-minute limit of their own',
    noOwnLimit: 'no limit of its own',
  },
  es: {
    perKey: 'límites por API key',
    requestsPerMin: 'Peticiones / min',
    maxParallel: 'Máximo en paralelo',
    concurrent: 'concurrentes',
    premium: 'límites del tier premium',
    window: (h: number) => `Ventana móvil de ${h}h`,
    allowance: 'Cuota / periodo de facturación',
    context: 'Contexto',
    concurrentRequests: 'Peticiones concurrentes',
    tokensPerMin: 'Tokens / minuto',
    tokensPerModel: 'tokens / min por modelo',
    images: 'generación de imágenes',
    perSecond: 'Peticiones / seg',
    burst: 'Ráfaga',
    monthlyRequests: 'Peticiones / mes',
    maxVariants: 'Imágenes / petición',
    exempt: 'sin límite por minuto propio',
    noOwnLimit: 'sin límite propio',
  },
}[lang];
}
