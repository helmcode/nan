# NaN (nan.builders) — Architecture

> Private, paid community for Spanish-speaking builders, entrepreneurs, and tech professionals working with AI and AI agents.
> Tagline: "GPU compartida. Modelos open-source. Comunidad de builders."

## Overview

NaN is a shared GPU infrastructure project for a paid community. The website covers:

1. **Landing** — Presentation, models, pricing, and account signup (open signup)
2. **Documentation** — Public API docs for connecting tools (Cursor, Cline, OpenCode, etc.)

All community activity (chat, forums, events, model voting) lives in Discord.
Account creation is open: anyone can create a free account from the home form, and every product (community, inference, premium, workspaces, spaces) unlocks with a purchase on the [NaN Platform](https://cloud.nan.builders/), which also handles payment, onboarding and API keys. Spec: `platform/cloud-api/docs/OPEN-SIGNUP.md`.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Astro v6.0.8 (SSR mode, `output: 'server'`) | Static by default, SSR where needed |
| Interactive bits | Vanilla TS scripts (home, nav, signup form); Preact islands only where needed (events) | Zero framework JS on the marketing pages |
| Styling | Tailwind CSS v4.2.2 (Vite plugin) | Dark theme, technical typography |
| Code highlighting | rehype-pretty-code + shiki | Syntax highlighting in docs |
| Deployment | Cloudflare Workers (static assets + SSR) | Assets from CDN, SSR/API from Workers edge |
| Backend | NaN Platform cloud-api (Go + PostgreSQL) | Accounts, member lifecycle, billing, sign-in emails (English magic link) |
| Language | TypeScript (strict mode) | Type safety across the stack |

**Node requirement:** `>=22.12.0`

## Deployment Architecture

Everything runs as a single Cloudflare Worker (deployed via `wrangler deploy`, configured in `wrangler.jsonc`):

```
nan.builders (Cloudflare Worker)
│
├── CDN (Global Edge — static assets)
│   ├── Landing page (SSR-rendered at request time)
│   ├── Docs pages (SSR-rendered)
│   └── Static assets (CSS, JS, fonts, images, favicon)
│
└── Worker (Edge Functions)
    ├── /api/signup            POST — account signup (validates, proxies to cloud-api /api/auth/signup)
    ├── /api/auth/login-request POST — magic-link login from the events pages (proxy)
    ├── /api/events/*          events API proxy
    ├── /api/docs/*            docs manifest + markdown for the Discord bot
    └── SSR pages              /, /es, /community, /events, /projects, /docs/*
```

- **Static requests** (assets, images, favicon): served directly from CDN.
- **SSR requests** (/, /docs/*): routed to Worker. Runs Astro SSR.
- **API requests** (/api/*): routed to Worker. Validates input, then forwards to cloud-api backend (PostgreSQL).
- **No servers, no containers, no regions.** Workers run at the nearest edge location.

## Rendering Modes

| Route | Mode | Client JS |
|-------|------|-----------|
| `/`, `/es` | SSR (not prerendered) | Vanilla scripts: hero dither, signup form (`scripts/signup.ts`), reveal |
| `/community`, `/es/community` | SSR (not prerendered) | None beyond the shared shell (CTA links to the platform signup) |
| `/docs*` | SSR (not prerendered) | Minimal (sidebar mobile menu, TOC, copy-to-clipboard) |
| `/api/signup` | Server endpoint | None |

## Pricing (Current)

| Product | Price | Signup link |
|---------|-------|-------------|
| `nan_member · glm 5.3 premium` | 200€/mo | `https://cloud.nan.builders/signup?plan=premium` |
| `nan_member` (inference) | 70€/mo | `https://cloud.nan.builders/signup?plan=inference` |
| `nan_community` | 14,99€/mo | `https://cloud.nan.builders/signup?plan=community` |
| Workspace slots | from 4,99€/mo | `https://cloud.nan.builders/signup?plan=workspace` |

Billed in euros from every region, taxes included, month to month. Links are built with `signupUrl()` in `src/lib/signup.ts`.

## Server Hardware

| Component | Specification |
|-----------|-------------|
| GPU | NVIDIA RTX PRO 6000 Blackwell |
| VRAM | 96 GB GDDR7 ECC |
| RAM | 256 GB DDR5 ECC |
| CPU | 48 threads · Xeon Gold 5412U |
| Inference | vLLM → LiteLLM |
| Embedding | HuggingFace TEI → LiteLLM |
| TTS | kokoro-fastapi → LiteLLM |
| STT | speaches → LiteLLM |

## Member Lifecycle States

| State | Description |
|-------|-------------|
| `free` | Account created (open signup), no product purchased yet |
| `subscribed` | Active member with a community, inference or premium subscription |
| `declined` | Manual: test/junk entries kept for audit |
| `banned` | Manual: membership revoked |

The legacy `waitlist`/`invited` rows are migrated to `free` by cloud-api. All transitions are managed by the [NaN Platform](https://cloud.nan.builders/), not by this website.

## Routes

### Landing Page (`/`)

Static sections, SSR-rendered (`src/pages/_home.astro`, components in `src/components/nan/home/`):

| Section | Component | Client JS |
|---------|-----------|-----------|
| Nav (Login + Create account) | `nan/Nav.astro` | Small inline script (mobile menu) |
| Hero + signup form (`#signup`) | `Hero.astro` | `scripts/signup.ts` (vanilla) + canvas dither |
| What is NaN | `WhyNan.astro` | None |
| Built with NaN | `BuiltWithNan.astro` | None |
| Models | `Models.astro` | None |
| Privacy | `Privacy.astro` | None |
| Pricing + workspaces | `Pricing.astro` | None |
| Who is behind | `WhoBehind.astro` | None |
| FAQ | `Faq.astro` | None (`<details>`) |

`/community` (`src/pages/_community.astro`) has no form of its own: its CTAs link to `signup?plan=community`, and the platform runs the per-user Stripe Checkout.

### Documentation (`/docs*`)

| Route | Description |
|-------|-------------|
| `/docs` | Introduction, hardware specs, rates, next steps |
| `/docs/getting-started` | Step-by-step connection guide |
| `/docs/models` | Available model specs |
| `/docs/examples` | Code snippets (Python, Node.js, curl) |
| `/docs/api` | OpenAI-compatible API reference (endpoints, auth, rate limits) |

Sidebar navigation comes from each guide's frontmatter (`src/content.config.ts`): `group` picks the section, `order` the position, and an optional `parent` (the entry id of another guide, identical in EN and ES) lists the page as an indented sub-item right under that guide, in the parent's group. The library supports any depth, but content is kept to one level (enforced in `DocsShell.test.ts`), and a child's `order` must be the slot right after its parent so the flat order (`/api/docs` manifest) matches the sidebar. URLs stay flat (`/docs/<id>`); the breadcrumb and prev/next follow the sidebar's visual order. Logic and tests: `src/lib/docsNav.ts`; markup: `src/components/docs/DocsSidebarNav.astro` + `DocsNavList.astro` (rendered in tests with the Astro Container API, `*.render.test.ts`, see `vitest.render.config.ts`).

### API Endpoints

#### `POST /api/signup`

Creates a NaN account through cloud-api's public `POST /api/auth/signup` (`OPEN-SIGNUP.md` §2.3). The browser cannot call cloud-api directly because the CSP is `connect-src 'self'`.

- **Input (JSON):** `{ fullName, email, jobRole, jobRoleOther, xUrl, linkedinUrl, plan?, _hp }`
- **Validation** (`validateSignup()` in `src/lib/signup.ts`, shared with the form):
  - `fullName` 1-120 chars, `email` valid and not on the blocked-domain list, `jobRole` in `software_engineer | ai_engineer | data_scientist | devops_sre | founder | product | designer | researcher | student | other`; `jobRoleOther` 1-80 chars, required only when `jobRole` is `other`.
  - `xUrl` optional, `https://x.com/...` or `https://twitter.com/...`; `linkedinUrl` optional, `https://(www.)linkedin.com/in/...`. Missing scheme, `http://`, `www.` and LinkedIn country subdomains are normalized before sending.
  - `plan` optional (`community | inference | premium | workspace | space`); an unknown plan is dropped, never an error. The form reads it from `?plan=` (and the legacy `?premium=1`).
- **Honeypot:** `_hp` filled → same `202` as a real signup, nothing forwarded.
- **Rate limit:** 5 valid submissions per IP per 10 minutes, in memory per isolate (best effort; cloud-api limits per IP and per email behind it). Invalid submissions do not count.
- **Upstream call:** `POST ${CLOUD_API_URL}/api/auth/signup` with `Origin: https://nan.builders`, the client IP in `x-forwarded-for` / `cf-connecting-ip`, and the visitor country in `cf-ipcountry` (cloud-api derives the billing region from it). No API key: the endpoint is public.
- **Content type:** the media type must be exactly `application/json` (parameters such as `charset` allowed). The hero form has `method="post" action="/api/signup"`, so without JS the browser posts form data instead of putting it in a URL; that post gets a `415` static HTML page (dark, no JS, own CSP; Spanish when posted from `/es` or, without a same-origin Referer, when Accept-Language prefers it) linking to `https://cloud.nan.builders/signup`, and the body is never read (`src/lib/signupNoJs.ts`).
- **Responses:**
  - `202`: `{ ok: true }` for every accepted signup, new or known email (no account enumeration). The form shows "Check your inbox to confirm and sign in"; cloud-api sends the English magic link.
  - `400`: `{ ok: false, error: 'invalid_input', fields: { <field>: 'required' | 'invalid' | 'too_long' } }`
  - `413` / `415`: oversized body / not `application/json` (`{ ok: false, error: 'unsupported_media_type' }`, or the HTML page for a no-JS form post)
  - `429`: `{ ok: false, error: 'rate_limited' }`
  - `502`: `{ ok: false, error: 'server_error' }` (upstream error or unreachable; details only in the Worker log)

## Internationalization

The site is bilingual: English at the root (`/`) and Spanish under `/es`. Catalogs live in `i18n/en.json` and `i18n/es.json` (same shape, enforced by `i18nParity.test.ts`) and are read through `src/lib/i18n.ts` (`useT`, `t`, `tArr`, `tObj`, `getLang`, `switchLocalePath`). Emails sent by the platform are English only.

## Security

| Mechanism | Implementation |
|-----------|---------------|
| CSP | Strict policy in `NanBase.astro` (`connect-src 'self'`, no external scripts, no frames, no objects) |
| Bot protection | Honeypot field (`_hp`) on the signup form + per-IP rate limiting at the edge + cloud-api per-IP/per-email limits + Origin allowlist |
| IP detection | `cf-connecting-ip` only (never `x-forwarded-for` on Cloudflare) |
| Secrets | All in Cloudflare Pages dashboard via `wrangler secret put`, never in code |
| Error handling | Intentionally opaque error responses (no internal details leaked) |

## Project Structure

```
website/
├── src/
│   ├── pages/
│   │   ├── _home.astro, index.astro, es/index.astro   # Landing (EN root, ES under /es)
│   │   ├── _community.astro, community.astro          # Community page (CTA to platform signup)
│   │   ├── privacy.astro, terms.astro, cookies.astro  # Legal (+ es/ versions)
│   │   ├── api/
│   │   │   ├── signup.ts                  # POST — account signup proxy
│   │   │   ├── auth/login-request.ts      # POST — magic-link login proxy (events)
│   │   │   ├── events/[...path].ts        # Events API proxy
│   │   │   └── docs/                      # Docs manifest + markdown
│   │   ├── docs/, events/, projects.astro, gauntlet.astro, survey.astro
│   ├── components/
│   │   ├── nan/                           # Nav, Footer, CookieBanner, home/ sections
│   │   ├── docs/                          # Docs shell components
│   │   └── events/                        # Events islands (Preact)
│   ├── scripts/                           # Vanilla client scripts (signup, reveal, dither, ...)
│   ├── lib/
│   │   ├── signup.ts                      # Signup validation/normalization/parsing (client + server)
│   │   ├── signupServer.ts                # Edge rate limit + cloud-api call (server only)
│   │   ├── i18n.ts                        # Translation helpers
│   │   └── ...                            # docs, events, rate limits, models
│   ├── layouts/                           # NanBase (CSP, head), NanPage (shell), Docs, NanLegal
│   ├── tests/                             # Vitest suites (api/, lib/, landing/, layouts/, legal/, pages/)
│   └── env.d.ts                           # Cloudflare env type declarations
├── i18n/                                  # en.json, es.json
├── public/                                # Static assets, _routes.json
├── astro.config.mjs, wrangler.jsonc, vitest.config.ts, tsconfig.json, package.json
└── .env.example
```

## Environment Variables

### Runtime (declared in `src/env.d.ts`)

| Variable | Type | Purpose |
|----------|------|---------|
| `CLOUD_API_URL` | `string` | Backend API base URL (e.g. `https://cloud-api.nan.builders`), used by `/api/signup`, the events proxy and login |
| `RATE_LIMIT_RPM` / `RATE_LIMIT_PARALLEL` | `string` (optional) | Per-key limits shown in the docs (defaults in `src/lib/rateLimits.ts`) |

`RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `CLOUD_API_WAITLIST_KEY` are no longer used by the site (the waitlist and its confirmation email are gone; cloud-api sends the sign-in email).

All secrets are stored in Cloudflare via `wrangler secret put`. Never committed to the repository.

## CI/CD

### CI (`.github/workflows/ci.yml`)

Triggered on PRs to `main`:

1. `npm ci` — install dependencies
2. `npm test` — run Vitest suite
3. `npx astro check` — TypeScript type checking
4. `npm run build` — production build

### Deploy (`.github/workflows/deploy.yml`)

Triggered on push to `main`:

1. `npm ci` — install dependencies
2. `npm test` — run tests
3. `npm run build` — production build
4. `npx wrangler deploy` — deploy to Cloudflare

Uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

## Build Command

```bash
npm run build
```

Runs `astro check --quiet` (type check, non-blocking) then `astro build`. Copies `public/_routes.json` to `dist/client/` for Cloudflare routing rules.

## Testing

```bash
npm test        # Run all tests (Vitest)
npm run test:watch  # Watch mode
```

Tests are in `src/**/*.test.ts` (Node) and `src/**/*.render.test.ts` (Astro Container API). Open-signup suites:
- `src/tests/lib/signup.test.ts` — validation, normalization, plan, response parsing
- `src/tests/api/signup.test.ts` — `/api/signup` proxy, validation, honeypot, rate limit, error mapping
- `src/tests/landing/signupForm.test.ts` — hero form markup, script wiring, copy in both locales
- `src/tests/landing/openSignup.test.ts` — CTA targets, no waitlist copy, legal pages
- `src/tests/layouts/noWebSearch.test.ts` — web search stays removed

## Cost Estimate

| Resource | Free tier | Expected usage |
|----------|-----------|---------------|
| Cloudflare Pages | Unlimited deploys, 500 builds/month | More than enough |
| Workers | 100K requests/day | Negligible usage |
| Domain | — | Already owned (nan.builders) |

**Estimated infrastructure cost: $0/month**
