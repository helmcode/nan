/**
 * Reading the rate limits from the platform instead of retyping them.
 *
 * cloud-api publishes the whole policy as one document and says, in the
 * comment above it, exactly why: the 400M/4h figure had been hand-copied into
 * four places - the rate-limit hook, cloud-ui's types.ts, this site's
 * rateLimits.ts and prose in the docs - "with nothing able to notice they had
 * diverged". This site was the surface where that went worst: it published a
 * per-minute ceiling for four models and not one of the four was right.
 *
 * WHAT IS WIRED AND WHAT IS NOT
 *
 * All of this is wired except the URL. `LIMITS_POLICY_URL` is unset, so
 * resolveRateLimitsConfig() returns the built-in table and never makes a
 * request - the page renders today exactly as it did before this file existed.
 * Point that variable at an endpoint serving the policy document and the site
 * starts following the platform.
 *
 * The endpoint it would read, GET /api/internal/limits/policy, sits behind
 * cloud-api's CreditsHookSecret, shared with the LiteLLM hook. Handing that to
 * a public-facing worker is a decision for whoever owns the platform, not
 * something to arrange from here, and the narrower answer is a public
 * read-only route: none of this document is secret, it is already published
 * verbatim on /docs/models. `LIMITS_POLICY_TOKEN` exists for whichever of the
 * two is chosen.
 *
 * THE RULES IT FOLLOWS, AND WHY EACH ONE
 *
 * 1. A failure is never visible. Any error, any timeout, any shape it does not
 *    recognise, and the built-in table is used instead. A limits card that
 *    fails to render is worse than one that is a deploy behind.
 *
 * 2. It refuses a document newer than it understands, the same way the hook
 *    does. Misreading a reshaped document sets WRONG numbers; declining it
 *    sets slightly old ones. cloud-api bumps `version` only when the shape
 *    changes incompatibly.
 *
 * 3. All or nothing. A document missing a field is rejected whole rather than
 *    filled in from the built-in table. Half a card, silently mixing two
 *    sources, is the failure this file exists to prevent.
 *
 * 4. Only models the catalogue publishes. The policy governs everything the
 *    platform serves, which is not the same set: `glm5.2` is in there and this
 *    site deliberately does not document it. The policy supplies the numbers;
 *    modelos.json still decides which models the page is about.
 */

import catalogue from '../data/modelos.json';
import {
  DEFAULT_RATE_LIMITS,
  getRateLimitsConfig,
  type ModelRate,
  type RateLimitsConfig,
  type RateLimitsEnv,
  type WindowedModelLimits,
} from './rateLimits';

/**
 * The highest `version` this file knows how to read, mirroring the hook's
 * LIMITS_POLICY_MAX_VERSION. Raise it only together with the mapping below.
 */
export const MAX_POLICY_VERSION = 1;

/** Long enough to be worth having, short enough that a bad fetch is not a page outage. */
const FETCH_TIMEOUT_MS = 2_000;

/** One fetch per worker per minute, not one per page render. */
const CACHE_TTL_MS = 60_000;

export interface LimitsPolicyEnv extends RateLimitsEnv {
  /** Unset today: leave it unset and nothing here runs. */
  LIMITS_POLICY_URL?: string;
  /** Sent as `X-API-Key`, which is what cloud-api's middleware.APIKey reads. */
  LIMITS_POLICY_TOKEN?: string;
}

interface PolicyModel {
  window: number;
  concurrency: number;
  fills_per_min: number;
  monthly_token_cap: number | null;
  window_tokens: number | null;
  window_hours: number | null;
}

interface PolicyDocument {
  version: number;
  exempt_models: string[];
  models: Record<string, PolicyModel>;
}

const isPositiveInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0;

/** Null and absent both mean "this model has none", and must not become 0. */
const optionalPositiveInt = (v: unknown): boolean =>
  v === null || v === undefined || isPositiveInt(v);

function parsePolicy(raw: unknown): PolicyDocument | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const doc = raw as Record<string, unknown>;

  if (!isPositiveInt(doc.version) || doc.version > MAX_POLICY_VERSION) return null;
  if (!Array.isArray(doc.exempt_models) || !doc.exempt_models.every((m) => typeof m === 'string')) {
    return null;
  }
  if (typeof doc.models !== 'object' || doc.models === null) return null;

  const models: Record<string, PolicyModel> = {};
  for (const [name, value] of Object.entries(doc.models as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) return null;
    const m = value as Record<string, unknown>;
    if (
      !isPositiveInt(m.window) ||
      !isPositiveInt(m.concurrency) ||
      !isPositiveInt(m.fills_per_min)
    ) {
      return null;
    }
    if (
      !optionalPositiveInt(m.monthly_token_cap) ||
      !optionalPositiveInt(m.window_tokens) ||
      !optionalPositiveInt(m.window_hours)
    ) {
      return null;
    }
    models[name] = {
      window: m.window,
      concurrency: m.concurrency,
      fills_per_min: m.fills_per_min,
      monthly_token_cap: (m.monthly_token_cap as number | null) ?? null,
      window_tokens: (m.window_tokens as number | null) ?? null,
      window_hours: (m.window_hours as number | null) ?? null,
    };
  }
  return { version: doc.version, exempt_models: doc.exempt_models as string[], models };
}

/** Every model id the site documents, which is a subset of what the platform serves. */
export function documentedModels(): Set<string> {
  const data = catalogue as { categorias: Array<{ modelos: Array<{ id: string }> }> };
  return new Set(data.categorias.flatMap((c) => c.modelos.map((m) => m.id)));
}

/**
 * The policy document, as this site publishes it.
 *
 * Returns null when the document cannot be turned into a complete config, so
 * the caller falls back whole rather than mixing sources.
 */
export function policyToRateLimits(
  doc: PolicyDocument,
  base: RateLimitsConfig,
): RateLimitsConfig | null {
  const documented = documentedModels();

  const perMinute: ModelRate[] = [];
  const windowed: WindowedModelLimits[] = [];

  for (const [model, m] of Object.entries(doc.models)) {
    if (!documented.has(model)) continue;

    // A rolling window is what makes a model windowed, and it needs all three
    // numbers to be publishable. Two of three is a card with a hole in it.
    if (m.window_tokens !== null || m.window_hours !== null) {
      if (m.window_tokens === null || m.window_hours === null || m.monthly_token_cap === null) {
        return null;
      }
      windowed.push({
        model,
        contextTokens: m.window,
        fillsPerMinute: m.fills_per_min,
        maxParallel: m.concurrency,
        windowHours: m.window_hours,
        windowTokens: m.window_tokens,
        periodCapTokens: m.monthly_token_cap,
      });
      continue;
    }
    perMinute.push({ model, contextTokens: m.window, fillsPerMinute: m.fills_per_min });
  }

  // A document that governs none of the models this site documents is not a
  // policy for this page; it is a misconfiguration pointing somewhere else.
  if (perMinute.length === 0 && windowed.length === 0) return null;

  // Deterministic order, biggest ceiling first, so the card does not reshuffle
  // between renders on an object whose key order is not guaranteed.
  perMinute.sort(
    (a, b) =>
      b.contextTokens * b.fillsPerMinute - a.contextTokens * a.fillsPerMinute ||
      a.model.localeCompare(b.model),
  );
  windowed.sort((a, b) => a.model.localeCompare(b.model));

  return {
    ...base,
    tokensPerMinuteByModel: perMinute,
    exemptModels: doc.exempt_models.filter((m) => documented.has(m)),
    windowedModels: windowed,
    // Neither of these comes from the policy document. The per-key limits are
    // set on the LiteLLM key, and image generation does not go through LiteLLM
    // at all - see imageModels in rateLimits.ts.
    perKey: base.perKey,
    imageModels: base.imageModels,
  };
}

let cached: { at: number; config: RateLimitsConfig } | null = null;

/** Test seam: the module-level cache would otherwise leak between cases. */
export function resetPolicyCache(): void {
  cached = null;
}

async function fetchPolicy(env: LimitsPolicyEnv): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(env.LIMITS_POLICY_URL as string, {
      headers: env.LIMITS_POLICY_TOKEN ? { 'X-API-Key': env.LIMITS_POLICY_TOKEN } : {},
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(
        `[limitsPolicy] ${res.status} from the policy endpoint, using the built-in table`,
      );
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('[limitsPolicy] could not read the policy, using the built-in table', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The config the docs render from.
 *
 * With `LIMITS_POLICY_URL` unset this is getRateLimitsConfig() and nothing
 * else: no fetch, no await of consequence, no behaviour change.
 */
export async function resolveRateLimitsConfig(
  env: LimitsPolicyEnv = {},
): Promise<RateLimitsConfig> {
  const base = getRateLimitsConfig(env);
  if (!env.LIMITS_POLICY_URL) return base;

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.config;

  const raw = await fetchPolicy(env);
  if (raw === null) return base;

  const doc = parsePolicy(raw);
  if (!doc) {
    console.warn(
      `[limitsPolicy] policy document not understood (this build reads up to version ` +
        `${MAX_POLICY_VERSION}), using the built-in table`,
    );
    return base;
  }

  const mapped = policyToRateLimits(doc, base);
  if (!mapped) {
    console.warn(
      '[limitsPolicy] policy document is incomplete for this page, using the built-in table',
    );
    return base;
  }

  cached = { at: Date.now(), config: mapped };
  return mapped;
}

/** Re-exported so a caller never has to reach past this module for the fallback. */
export { DEFAULT_RATE_LIMITS };
