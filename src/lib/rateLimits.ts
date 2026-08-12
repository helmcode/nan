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
  label: string;
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
  perKey: { requestsPerMinute: 60, maxParallel: 5 },
  tokensPerMinuteByModel: [
    { model: 'deepseek-v4-flash', label: '1.5M tpm' },
    { model: 'mimo-v2.5', label: '1.5M tpm' },
    { model: 'qwen3.6', label: '1.5M tpm' },
    { model: 'gemma4', label: '1.5M tpm' },
  ],
  requestsPerMinuteByModel: [{ model: 'rerank', label: '1000 rpm' }],
  // glm5.2 (premium tier) is absent from the per-minute tables on purpose: its
  // gate is the 4h sliding window plus the allowance per billing period. These
  // mirror the backend policy (cloud-api modelRateLimits + the token cap for
  // glm5.2) and the usage hook's window budget, which is the same set of
  // numbers the member portal publishes.
  windowedModels: [
    {
      model: 'glm5.2',
      contextTokens: 500_000,
      maxParallel: 5,
      windowHours: 4,
      windowTokens: 400_000_000,
      periodCapTokens: 3_000_000_000,
    },
  ],
};

/**
 * Formats a token count the way every published surface writes it: 500K,
 * 400M, 3,000M. Lives here so the docs page and /api/docs cannot drift from
 * each other, which is the whole reason this module exists.
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toLocaleString('en-US')}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toLocaleString('en-US')}K`;
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
export function windowedModelHeadline(m: WindowedModelLimits): string {
  return `${formatTokens(m.windowTokens)} tokens per rolling ${m.windowHours} hours`;
}

/** The rest of the sentence started by windowedModelHeadline(). */
export function windowedModelBody(m: WindowedModelLimits): string {
  return (
    `is the limit a heavy coding-agent run reaches first, well before the allowance. ` +
    `Once you hit it, ${m.model} requests are rejected until the window slides forward: ` +
    `it is a rolling window, not a daily reset. The allowance counter goes back to zero ` +
    `when your billing period starts, and if you upgrade part-way into a period that ` +
    `first allowance is prorated to the share of the period you paid for.`
  );
}

/** Headline plus body, for the surfaces that publish it as one paragraph. */
export function windowedModelNote(m: WindowedModelLimits): string {
  return `${windowedModelHeadline(m)} ${windowedModelBody(m)}`;
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
    'Limits apply per API key (RPM and concurrency), not on total token volume:',
    '',
    ...rows,
  ];

  for (const m of config.windowedModels) {
    out.push(
      '',
      `\`${m.model}\` is not gated by a per-minute rate but by a rolling window plus an ` +
        `allowance per billing period: ${formatTokens(m.windowTokens)} tokens per rolling ` +
        `${m.windowHours} hours and a ${formatTokens(m.periodCapTokens)}-token allowance that ` +
        `returns to zero when your billing period starts. The window is rolling, not a daily ` +
        `reset. Context window: ${formatTokens(m.contextTokens)} tokens, ` +
        `${m.maxParallel} concurrent requests.`,
    );
  }

  return out.join('\n');
}
