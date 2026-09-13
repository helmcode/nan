/**
 * The one list of model ids NaN serves.
 *
 * The ids were written by hand on five surfaces with no relation to each
 * other: the home table (src/data/modelos.json), the model cards of
 * /docs/models, the snippets of /docs/examples, the catalog table inside
 * src/data/openapi.json, and the quickstart. They drifted, and a drift here is
 * not cosmetic: the home published the reranker as `qwen3-reranker` while the
 * API answers to `rerank`, so anyone who copied the id off the landing page
 * got a 404 `model_not_found`. `flux-2-klein` had the opposite problem, served
 * by the API and absent from the table, which makes a model invisible.
 *
 * This module holds the facts a reader needs in order to CHOOSE (what it is
 * for, how much context, what it accepts, what it spends), not the editorial
 * prose of each card. The cards stay hand-written, because what they say about
 * a model is a judgement, not data. What cannot be a judgement is the spelling
 * of an id, and that is what modelCatalog.test.ts checks across every surface.
 *
 * glm5.3's window and allowance are NOT repeated here: they already live in
 * rateLimits.ts, which is env-driven and feeds both the card and /api/docs.
 */

export type ModelKind = 'chat' | 'embedding' | 'rerank' | 'tts' | 'stt' | 'image';

export type Modality = 'text' | 'image' | 'audio';

/**
 * How a model counts against what you pay for.
 *
 * `unmetered` is not "unlimited": the per-minute limits in rateLimits.ts still
 * apply. It means no token counter is attached to the model. `billingPeriod`
 * exists because glm5.3's counter returns to zero when the Stripe period
 * starts, not on the first of the month, and writing it as monthly is the
 * mistake every surface made at least once.
 */
export type QuotaKind = 'unmetered' | 'monthly' | 'billingPeriod';

export interface ModelSpec {
  /** Exactly what goes in the `model` field of a request. */
  id: string;
  /** Who trained it, so a reader can map the id to a model they know. */
  by: string;
  kind: ModelKind;
  /** Context window in tokens. Chat models only. */
  contextTokens?: number;
  /** What it accepts as input. Output is text on every chat model. */
  inputs?: Modality[];
  quota: { kind: QuotaKind; label?: { en: string; es: string } };
  /** Only callable with a key on the premium tier. */
  premium?: boolean;
  /**
   * A previous generation, still served so that configurations naming it keep
   * working. Not what a newcomer should be pointed at, and it was: every
   * snippet in the docs used `qwen3.6`.
   */
  legacy?: boolean;
  /** The endpoint the id is called on. */
  endpoint: string;
  /** The one-line answer to "when do I pick this one?". */
  bestFor: { en: string; es: string };
}

export const MODELS: ModelSpec[] = [
  {
    id: 'deepseek-v4-flash',
    by: 'DeepSeek',
    kind: 'chat',
    contextTokens: 1_000_000,
    inputs: ['text', 'image'],
    quota: { kind: 'monthly', label: { en: '3B tokens / mo', es: '3B tokens/mes' } },
    endpoint: '/chat/completions',
    bestFor: {
      en: 'General chat and reasoning, the best quality on the cluster',
      es: 'Chat y razonamiento general, la mejor calidad del clúster',
    },
  },
  {
    id: 'glm5.3',
    by: 'Z.ai',
    kind: 'chat',
    contextTokens: 1_000_000,
    inputs: ['text'],
    quota: {
      kind: 'billingPeriod',
      label: { en: '3B tokens / billing period', es: '3B tokens/periodo de facturación' },
    },
    premium: true,
    endpoint: '/chat/completions',
    bestFor: {
      en: 'Coding agents and long-horizon tasks',
      es: 'Agentes de código y tareas largas',
    },
  },
  {
    id: 'glm5.3-flash',
    by: 'Z.ai',
    kind: 'chat',
    contextTokens: 1_000_000,
    inputs: ['text', 'image'],
    quota: { kind: 'monthly', label: { en: '2B tokens / mo', es: '2B tokens/mes' } },
    endpoint: '/chat/completions',
    bestFor: {
      en: 'Coding agents without the premium tier',
      es: 'Agentes de código sin el tier premium',
    },
  },
  {
    id: 'qwen3.8-flash',
    by: 'Alibaba',
    kind: 'chat',
    contextTokens: 262_144,
    inputs: ['text', 'image'],
    quota: { kind: 'monthly', label: { en: '500M tokens / mo', es: '500M tokens/mes' } },
    endpoint: '/chat/completions',
    bestFor: {
      en: 'Fast answers, when latency matters more than depth',
      es: 'Respuestas rápidas, cuando importa más la latencia que la profundidad',
    },
  },
  {
    id: 'mimo-v2.5',
    by: 'Xiaomi',
    kind: 'chat',
    contextTokens: 1_000_000,
    inputs: ['text', 'image', 'audio'],
    quota: { kind: 'monthly', label: { en: '1.0B tokens / mo', es: '1.0B tokens/mes' } },
    endpoint: '/chat/completions',
    bestFor: {
      en: 'Passing audio straight to the model. The only omnimodal one',
      es: 'Pasarle audio directamente al modelo. El único omnimodal',
    },
  },
  {
    id: 'gemma4',
    by: 'Google',
    kind: 'chat',
    contextTokens: 262_144,
    inputs: ['text', 'image'],
    quota: { kind: 'unmetered' },
    endpoint: '/chat/completions',
    bestFor: {
      en: 'Short tasks and testing, with no token counter attached',
      es: 'Tareas cortas y pruebas, sin contador de tokens',
    },
  },
  {
    id: 'qwen3.6',
    by: 'Alibaba',
    kind: 'chat',
    contextTokens: 262_144,
    inputs: ['text', 'image'],
    quota: { kind: 'unmetered' },
    legacy: true,
    endpoint: '/chat/completions',
    bestFor: {
      en: 'Previous generation. Still served, so existing configs keep working',
      es: 'Generación anterior. Se sigue sirviendo, así que las configuraciones que ya lo nombran no se rompen',
    },
  },
  {
    id: 'qwen3-embedding',
    by: 'Alibaba',
    kind: 'embedding',
    inputs: ['text'],
    quota: { kind: 'unmetered' },
    endpoint: '/embeddings',
    bestFor: {
      en: 'Turning text into 4096-dimension vectors. First half of a RAG stack',
      es: 'Convertir texto en vectores de 4096 dimensiones. Primera mitad de un RAG',
    },
  },
  {
    id: 'rerank',
    by: 'Alibaba',
    kind: 'rerank',
    inputs: ['text'],
    quota: { kind: 'unmetered' },
    endpoint: '/rerank',
    bestFor: {
      en: 'Reordering what you retrieved by relevance. Second half of a RAG stack',
      es: 'Reordenar por relevancia lo que has recuperado. Segunda mitad de un RAG',
    },
  },
  {
    id: 'kokoro',
    by: 'Hexgrad',
    kind: 'tts',
    inputs: ['text'],
    quota: { kind: 'unmetered' },
    endpoint: '/audio/speech',
    bestFor: { en: 'Text to speech, 67 voices', es: 'Texto a voz, 67 voces' },
  },
  {
    id: 'whisper',
    by: 'OpenAI',
    kind: 'stt',
    inputs: ['audio'],
    quota: { kind: 'unmetered' },
    endpoint: '/audio/transcriptions',
    bestFor: { en: 'Speech to text, 99+ languages', es: 'Voz a texto, 99+ idiomas' },
  },
  {
    id: 'flux-2-klein',
    by: 'Black Forest Labs',
    kind: 'image',
    inputs: ['text', 'image'],
    quota: { kind: 'monthly', label: { en: '100 requests / mo', es: '100 peticiones/mes' } },
    endpoint: '/images/generations',
    bestFor: {
      en: 'Generating and editing images',
      es: 'Generar y editar imágenes',
    },
  },
];

/** Every id the cluster answers to, for validating what the docs write. */
export const MODEL_IDS: readonly string[] = MODELS.map((m) => m.id);

export function getModel(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

/** The chat models, in the order a reader should consider them. */
export const CHAT_MODELS = MODELS.filter((m) => m.kind === 'chat');

/**
 * The context window as the docs write it: 1M, 262K.
 *
 * Decimal, not binary. 262144 tokens was published as "262K" on the
 * qwen3.8-flash card and as "256K" on the qwen3.6 and gemma4 ones, which is
 * the same number written two ways and reads as two different windows. One
 * function settles it for every surface.
 *
 * Deliberately not Intl-formatted: these are round figures that read the same
 * in both languages, and the exact token count belongs in the model card, not
 * in a decision table.
 */
export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`;
  return `${Math.round(tokens / 1000)}K`;
}

/** What the quota column shows, including the unmetered case. */
export function quotaLabel(m: ModelSpec, lang: 'en' | 'es'): string {
  if (m.quota.kind === 'unmetered') return lang === 'es' ? 'sin contador' : 'unmetered';
  return m.quota.label![lang];
}

/** The input modalities as a short list: "text · image". */
export function inputsLabel(m: ModelSpec, lang: 'en' | 'es'): string {
  const T = {
    en: { text: 'text', image: 'image', audio: 'audio' },
    es: { text: 'texto', image: 'imagen', audio: 'audio' },
  }[lang];
  return (m.inputs ?? ['text']).map((i) => T[i]).join(' · ');
}

/**
 * The home table's quota chip, translated out of the data file.
 *
 * `src/data/modelos.json` is ONE file rendered on both homepages, and its
 * `cuota` is written in Spanish. This is the function that made that work, and
 * it used to live inline in Models.astro - where nothing could test it, and
 * where a new phrasing added to the data file would have printed Spanish on
 * the English homepage with no build failing. That is not hypothetical: the
 * neighbouring `specs` field carried "67 voces" on /#models for months.
 *
 * The premium quota goes by the Stripe billing period, not by the calendar
 * month, and that is why it is never written as monthly on any surface.
 */
export function homeQuotaLabel(cuota: string, lang: 'en' | 'es'): string {
  if (lang === 'es') return cuota;
  return cuota
    .replace('sin contador', 'unmetered')
    .replace('/periodo de facturación', ' / billing period')
    .replace('/mes', ' / mo');
}
