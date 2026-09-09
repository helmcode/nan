/**
 * Única fuente de verdad de los rate limits que se enseñan en la documentación.
 *
 * Lo consumen <RateLimits /> (lo que lee una persona) y rateLimitsToMd()
 * (lo que /api/docs sirve al bot de Discord). Tener un solo módulo hace que la
 * página y la API no puedan discrepar, que es lo que pasaba: el componente
 * decía 60 rpm mientras el extractor tenía 100 rpm hardcodeados.
 *
 * Recibe el env como parámetro para poder probarlo con tests unitarios sin
 * bindings de runtime, igual que src/lib/email.ts.
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
 * Límites de un modelo que no se controla por una tasa por minuto sino por una
 * sliding window más una cuota por periodo de facturación. Son los dos números
 * con los que un miembro tiene que planificar, así que se publican como filas
 * de primera clase y no como una nota al pie.
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
 * Las tablas por modelo se quedan aquí y no en variables de entorno: solo
 * cambian cuando se añade o se quita un modelo, que ya es un cambio de código.
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
  // glm5.3 (tier premium) falta a propósito en las tablas por minuto: su
  // control es la sliding window de 4h más la cuota por periodo de facturación.
  // Estos números replican la política del backend (modelRateLimits de cloud-api
  // más el tope de tokens de glm5.3) y el presupuesto de ventana del hook de
  // uso, que es el mismo conjunto de números que publica el portal de miembros.
  windowedModels: [
    {
      model: 'glm5.3',
      contextTokens: 1_000_000,
      maxParallel: 5,
      windowHours: 4,
      windowTokens: 400_000_000,
      periodCapTokens: 3_000_000_000,
    },
  ],
};

/**
 * Formatea un recuento de tokens como lo escribe cada superficie publicada: 1M,
 * 400M, 3,000M. Vive aquí para que la página de docs y /api/docs no puedan
 * desviarse la una de la otra, que es la razón de ser de este módulo.
 */
export type DocsLocale = 'en' | 'es';

export function formatTokens(tokens: number, lang: DocsLocale = 'en'): string {
  // El separador de miles es el que usa el resto de la página, para que la
  // tarjeta no diga "3,000M" al lado de una ficha de modelo que dice "3.000M".
  // `useGrouping: 'always'` porque es-ES deja sin agrupar los números de cuatro
  // cifras, y saldría 3000M junto a una ficha de modelo que ya dice 3.000M.
  const fmt = new Intl.NumberFormat(lang === 'es' ? 'es-ES' : 'en-US', { useGrouping: 'always' });
  if (tokens >= 1_000_000) return `${fmt.format(tokens / 1_000_000)}M`;
  if (tokens >= 1_000) return `${fmt.format(tokens / 1_000)}K`;
  return String(tokens);
}

/**
 * La redacción de la ventana, escrita una sola vez.
 *
 * <RateLimits /> resalta la frase principal y /api/docs sirve texto plano, así
 * que la frase se parte en dos mitades en vez de reescribirla en cada
 * superficie: la página y el bot de Discord ya se pillaron discrepando sobre
 * los rpm, y este es el número con el que planifica un miembro premium.
 */
export function windowedModelHeadline(m: WindowedModelLimits, lang: DocsLocale = 'en'): string {
  return lang === 'es'
    ? `${formatTokens(m.windowTokens, lang)} tokens por ventana móvil de ${m.windowHours} horas`
    : `${formatTokens(m.windowTokens)} tokens per rolling ${m.windowHours} hours`;
}

/** El resto de la frase que empieza windowedModelHeadline(). */
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

/** Titular más cuerpo, para las superficies que lo publican como un solo párrafo. */
export function windowedModelNote(m: WindowedModelLimits, lang: DocsLocale = 'en'): string {
  return `${windowedModelHeadline(m, lang)} ${windowedModelBody(m, lang)}`;
}

function parsePositiveInt(raw: string | undefined, fallback: number, varName: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    // Una variable mal configurada no debe tumbar la documentación, pero tiene que hacer ruido.
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
 * La sección de rate limits de la spec OpenAPI, construida desde esta misma config.
 *
 * La spec (src/data/openapi.json) lleva un placeholder `{{RATE_LIMITS}}` en
 * vez de los números, y se rellena cuando se sirve la spec. Sin esto los
 * números serían una tercera copia hardcodeada, que es justo el fallo que este
 * módulo se escribió para evitar: el componente y el extractor ya se habían
 * desviado una vez (60 rpm frente a 100 rpm), y `RATE_LIMIT_RPM` es una variable
 * de entorno, así que un cambio desplegado actualizaría /docs/models y dejaría
 * /docs/api publicando un número que ya no es cierto.
 *
 * La redacción es la de la spec (en inglés, tabla primero, dirigida a quien va
 * a escribir un cliente) y no la de la página de docs; solo se comparten los
 * datos, que es lo que tiene que coincidir.
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
    // La etiqueta ya lleva su unidad ("1.5M tpm"), así que la columna de valor
    // la toma tal cual y los modelos se listan en la columna del límite.
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

/**
 * Las etiquetas visibles de la tarjeta de rate limits. Viven aquí, junto a los
 * números que etiquetan, para que un locale no pueda caer en silencio
 * al otro idioma como pasaba cuando eran literales dentro del componente.
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
    tokensPerModel: 'tokens / min per model',
    requestsPerModel: 'requests / min per model',
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
    tokensPerModel: 'tokens / min por modelo',
    requestsPerModel: 'peticiones / min por modelo',
  },
}[lang];
}
