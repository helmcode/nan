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
  /**
   * Legacy flat outer cap default. Kept only so the RATE_LIMIT_PARALLEL env
   * override keeps parsing (an override must not crash the config), but no
   * published surface renders it any more: concurrency is enforced per model
   * (see concurrencyByModel), and the real per-key ceiling is tiered (see
   * tierMaxParallel below). It used to render as "Max parallel: 5 concurrent",
   * which the per-model tiers made false.
   */
  maxParallel: number;
  /**
   * The per-key outer ceiling, per member tier: LiteLLM caps the KEY at
   * max_parallel_requests across ALL models combined — 7 for the base
   * (inference) plan, 10 for premium. It is enforced on the key itself, so a
   * base member who sums the per-model allowances (7+7+5+5) and plans more
   * than 7 in flight hits this cap first, on models whose own limit was never
   * reached. Enforced by LiteLLM on the key, not by this site's env, so it is
   * a code constant like the per-model tables, and the per-key card publishes
   * it (perKeyOuterCapValue).
   */
  tierMaxParallel: { inference: number; premium: number };
}

export interface ModelRate {
  model: string;
  label: string;
}

/**
 * Concurrency a model allows, per member tier.
 *
 * Concurrency is enforced per model, not per key: every model allows the flat
 * default below, and the frontier models raise it for the member's tier, 7
 * concurrent for inference-tier members and 10 for premium (glm_access)
 * members. glm5.2 is premium too but intentionally stays at the flat 5, and
 * it is hidden by owner decision; served via the glm5.3 group alias, so it
 * has no row here.
 */
export interface ModelConcurrency {
  model: string;
  /** The flat default every tier falls back to; mirrors the backend default. */
  maxParallel: number;
  /** Per-tier overrides; when present they supersede maxParallel for that tier.
   *  `inference` is the backend's name for the base plan; the published labels
   *  render it as "base plan" — the vocabulary a member knows — not as
   *  "inference tier". */
  tierMaxParallel?: { inference: number; premium: number };
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
  maxParallel: number;
  windowHours: number;
  windowTokens: number;
  periodCapTokens: number;
}

export interface RateLimitsConfig {
  perKey: PerKeyRateLimits;
  tokensPerMinuteByModel: ModelRate[];
  requestsPerMinuteByModel: ModelRate[];
  concurrencyByModel: ModelConcurrency[];
  windowedModels: WindowedModelLimits[];
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
  // maxParallel is the legacy outer cap default (see PerKeyRateLimits): no
  // surface renders it; it exists for RATE_LIMIT_PARALLEL env-override compat.
  // tierMaxParallel is the real per-key ceiling: LiteLLM caps the key at
  // max_parallel_requests across all models combined, and the per-key card
  // publishes it.
  perKey: { requestsPerMinute: 60, maxParallel: 5, tierMaxParallel: { inference: 7, premium: 10 } },
  tokensPerMinuteByModel: [
    { model: 'deepseek-v4-flash', label: '1.5M tpm' },
    { model: 'mimo-v2.5', label: '1.5M tpm' },
    { model: 'qwen3.6', label: '1.5M tpm' },
    { model: 'gemma4', label: '1.5M tpm' },
  ],
  requestsPerMinuteByModel: [{ model: 'rerank', label: '1000 rpm' }],
  // Per-model concurrency. The flat default (5) is what every model allows;
  // the four frontier models raise it per tier. The chat models are
  // enumerated because they are the ones a member runs agents against; the
  // utility endpoints have no rows because the hook does not govern them:
  // audio, embeddings and rerank are exempt from the concurrency limit
  // (FALLBACK_EXEMPT_MODELS), and images are not hook-governed at all.
  // Env overrides do not reach this table: RATE_LIMIT_PARALLEL moves
  // only the legacy per-key outer cap (PerKeyRateLimits.maxParallel), which
  // no surface renders any more.
  concurrencyByModel: [
    { model: 'glm5.3', maxParallel: 5, tierMaxParallel: { inference: 7, premium: 10 } },
    { model: 'glm5.3-flash', maxParallel: 5, tierMaxParallel: { inference: 7, premium: 10 } },
    { model: 'deepseek-v4-flash', maxParallel: 5, tierMaxParallel: { inference: 7, premium: 10 } },
    { model: 'qwen3.8-flash', maxParallel: 5, tierMaxParallel: { inference: 7, premium: 10 } },
    { model: 'mimo-v2.5', maxParallel: 5 },
    { model: 'qwen3.6', maxParallel: 5 },
    { model: 'gemma4', maxParallel: 5 },
  ],
  // glm5.3 (premium tier) is absent from the per-minute tables on purpose: its
  // gate is the 4h sliding window plus the allowance per billing period. These
  // mirror the backend policy (cloud-api modelRateLimits + the token cap for
  // glm5.3) and the usage hook's window budget, which is the same set of
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
  windowedModels: [
    {
      model: 'glm5.3',
      contextTokens: 1_048_576,
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

/**
 * The concurrency a model allows a premium member: the number the premium
 * card ("glm5.3 · premium tier limits") and the spec's windowed note publish.
 * Those surfaces are addressed to premium members, so they resolve the
 * premium variant; a model without a tier variant falls back to the flat
 * default the caller hands in.
 */
export function premiumConcurrency(
  config: RateLimitsConfig,
  model: string,
  fallback: number,
): number {
  const entry = config.concurrencyByModel.find((c) => c.model === model);
  return entry?.tierMaxParallel?.premium ?? fallback;
}

/**
 * The value of a per-model concurrency row: the flat number, or the pair of
 * tier numbers when the model carries them. Shared by <RateLimits />,
 * rateLimitsToMd() and rateLimitsToSpecMarkdown() so the three surfaces
 * cannot disagree about the wording either.
 */
export function concurrencyValue(c: ModelConcurrency, lang: DocsLocale = 'en'): string {
  if (!c.tierMaxParallel) return `${c.maxParallel}`;
  const L = rateLimitsLabels(lang);
  return `${c.tierMaxParallel.inference} (${L.tierBase}) · ${c.tierMaxParallel.premium} (${L.tierPremium})`;
}

/**
 * The per-key card's outer-ceiling value: the number a member plans against
 * when they run requests across models, because the key caps the total before
 * any per-model limit is reached. Composed from the label table (the way
 * concurrencyValue composes the per-model values) so the two locales cannot
 * drift, and so the numbers come from the config instead of being retyped on
 * the page.
 */
export function perKeyOuterCapValue(perKey: PerKeyRateLimits, lang: DocsLocale = 'en'): string {
  const L = rateLimitsLabels(lang);
  return (
    `${perKey.tierMaxParallel.inference} (${L.tierBase}) · ` +
    `${perKey.tierMaxParallel.premium} (${L.tierPremium}) ${L.simultaneousPerKey}`
  );
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
      // The outer ceiling per tier is a code constant like the per-model
      // table: LiteLLM enforces it on the key, so no env var reaches it.
      tierMaxParallel: DEFAULT_RATE_LIMITS.perKey.tierMaxParallel,
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
  // The spec is English-only, so the labels resolve to the English table.
  const L = rateLimitsLabels('en');
  const rows = [
    '| Limit | Value |',
    '| --- | --- |',
    `| Requests per minute | ${config.perKey.requestsPerMinute} |`,
    // Concurrency is enforced per model, so instead of a flat per-key number
    // (which the per-model tiers made false) the row points at the per-model
    // table below.
    `| ${L.perKeyConcurrency} | ${L.concurrencyPointer} |`,
  ];
  if (tpm.length) {
    // The label already carries its unit ("1.5M tpm"), so the value column
    // takes it verbatim and the models are listed in the limit column.
    const models = tpm.map((m) => `\`${m.model}\``).join(', ');
    rows.push(`| Tokens per minute (${models}) | ${tpm[0].label.replace(/\s*tpm$/, '')} |`);
  }
  for (const m of config.requestsPerMinuteByModel) {
    rows.push(`| Requests per minute (\`${m.model}\`) | ${m.label.replace(/\s*rpm$/, '')} |`);
  }

  const out = [
    'Limits apply per API key (requests per minute) and per model (concurrent requests), not on total token volume:',
    '',
    ...rows,
  ];

  if (config.concurrencyByModel.length) {
    // Rows are grouped by value, the way the per-minute rows above group
    // models comma-joined in the limit column. One row per model would also
    // put `| `glm5.3` |` rows in the Rate limits section, ahead of the Model
    // catalog's row for the same model, and any consumer reading "the first
    // catalog row for X" would pick the wrong one. Grouping by VALUE rather
    // than by shape keeps a model whose numbers differ from its neighbours on
    // a row of its own instead of publishing their numbers for it.
    out.push(
      '',
      'Concurrency is enforced per model, not per key. The frontier models raise the default for the member\'s tier:',
      '',
      '| Model | Concurrent requests |',
      '| --- | --- |',
    );
    let group: string[] = [];
    let groupValue = '';
    const flush = () => {
      if (group.length) {
        out.push(`| ${group.map((m) => `\`${m}\``).join(', ')} | ${groupValue} |`);
      }
    };
    for (const c of config.concurrencyByModel) {
      const value = concurrencyValue(c);
      if (value !== groupValue) {
        flush();
        group = [];
        groupValue = value;
      }
      group.push(c.model);
    }
    flush();
    // The card names the endpoints the table does not cover; the spec says
    // the same, or a client author reads the rows above as exhaustive.
    out.push('', L.concurrencyExempt);
  }

  for (const m of config.windowedModels) {
    out.push(
      '',
      `\`${m.model}\` is not gated by a per-minute rate but by a rolling window plus an ` +
        `allowance per billing period: ${formatTokens(m.windowTokens)} tokens per rolling ` +
        `${m.windowHours} hours and a ${formatTokens(m.periodCapTokens)}-token allowance that ` +
        `returns to zero when your billing period starts. The window is rolling, not a daily ` +
        `reset. Context window: ${formatTokens(m.contextTokens)} tokens, ` +
        `${premiumConcurrency(config, m.model, m.maxParallel)} concurrent requests.`,
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
    // The per-key concurrency row: concurrency is enforced per model, so the
    // value points at the per-model card below instead of a flat number.
    perKeyConcurrency: 'Concurrent requests',
    concurrencyPointer: 'per model — see the per-model limits below',
    // The per-key outer ceiling row: the key caps the total across all
    // models, so the card states the ceiling next to the pointer — or a
    // member summing the per-model numbers plans past it and eats an
    // unexplained 429.
    perKeyAcrossModels: 'Across all models',
    simultaneousPerKey: 'simultaneous requests per key',
    premium: 'premium tier limits',
    window: (h: number) => `Rolling ${h}h window`,
    allowance: 'Allowance / billing period',
    context: 'Context window',
    concurrentRequests: 'Concurrent requests',
    tokensPerModel: 'tokens / min per model',
    requestsPerModel: 'requests / min per model',
    concurrencyPerModel: 'concurrent requests per model',
    concurrencyNote: 'Concurrency is enforced per model, not per API key.',
    // The utility endpoints have no per-model concurrency row: name them, so
    // a member scripting against them does not read the list above as
    // applying to every endpoint.
    concurrencyExempt: 'Audio, embedding and rerank endpoints have no concurrency limit.',
    tierBase: 'base plan',
    tierPremium: 'premium plan',
  },
  es: {
    perKey: 'límites por API key',
    requestsPerMin: 'Peticiones / min',
    perKeyConcurrency: 'Peticiones en paralelo',
    concurrencyPointer: 'por modelo — ver los límites por modelo abajo',
    perKeyAcrossModels: 'En todos los modelos',
    simultaneousPerKey: 'peticiones simultáneas por key',
    premium: 'límites del tier premium',
    window: (h: number) => `Ventana móvil de ${h}h`,
    allowance: 'Cuota / periodo de facturación',
    context: 'Contexto',
    concurrentRequests: 'Peticiones concurrentes',
    tokensPerModel: 'tokens / min por modelo',
    requestsPerModel: 'peticiones / min por modelo',
    concurrencyPerModel: 'peticiones concurrentes por modelo',
    concurrencyNote: 'La concurrencia se aplica por modelo, no por API key.',
    concurrencyExempt: 'Los endpoints de audio, embeddings y rerank no tienen límite de concurrencia.',
    tierBase: 'plan base',
    tierPremium: 'plan premium',
  },
}[lang];
}
