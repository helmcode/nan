# NaN (nan.builders) — Architecture

> Private, paid community for Spanish-speaking builders, entrepreneurs, and tech professionals working with AI and AI agents.
> Tagline: "GPU compartida. Modelos open-source. Comunidad de builders."

## Overview

NaN is a shared GPU infrastructure project for a paid community. The website covers:

1. **Landing** — Presentation, server specs, pricing, and waitlist signup
2. **Documentation** — Public API docs for connecting tools (Cursor, Cline, OpenCode, etc.)

All community activity (chat, forums, events, model voting) lives in Discord.
Payment processing, member onboarding, and API key management are handled by the [NaN Platform](https://cloud.nan.builders/).

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Astro v6.0.8 (SSR mode, `output: 'server'`) | Static by default, SSR where needed |
| Interactive islands | Preact v10.29.0 | Zero JS on static pages, hydration only where needed |
| Styling | Tailwind CSS v4.2.2 (Vite plugin) | Dark theme, technical typography |
| Code highlighting | rehype-pretty-code + shiki | Syntax highlighting in docs |
| Deployment | Cloudflare Workers (static assets + SSR) | Assets from CDN, SSR/API from Workers edge |
| Backend | NaN Platform cloud-api (Go + PostgreSQL) | Waitlist data, member lifecycle, billing |
| Transactional email | Resend | Waitlist confirmation emails |
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
    ├── /api/waitlist          POST — waitlist signup (forwards to cloud-api backend)
    ├── /api/community-signup  POST — community-tier signup (forwards to cloud-api, returns Stripe URL)
    └── SSR pages              /, /community, /docs/*
```

- **Static requests** (assets, images, favicon): served directly from CDN.
- **SSR requests** (/, /docs/*): routed to Worker. Runs Astro SSR.
- **API requests** (/api/*): routed to Worker. Validates input, then forwards to cloud-api backend (PostgreSQL).
- **No servers, no containers, no regions.** Workers run at the nearest edge location.

## Rendering Modes

| Route | Mode | Client JS |
|-------|------|-----------|
| `/` | SSR (not prerendered) | Minimal (Preact islands: WaitlistForm, FaqAccordion) |
| `/community` | SSR (not prerendered) | Minimal (Preact island: CommunitySignupForm) |
| `/docs*` | SSR (not prerendered) | Minimal (sidebar mobile menu, TOC, copy-to-clipboard) |
| `/api/waitlist` | Server endpoint | None |
| `/api/community-signup` | Server endpoint | None |

## Pricing (Current)

| Region | Price | Currency |
|--------|-------|----------|
| EU | 70 | €/mes (IVA incluido) |
| USA / LATAM | 75 | $/mes (impuestos incluidos) |

One tier per region. No early-bird pricing. No free trial. Monthly, no commitment.

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
| `waitlist` (default/absent) | Signed up, not invited yet |
| `invited` | Onboarding email sent, waiting for subscription |
| `subscribed` | Active member with subscription |
| `declined` | Manual: test/junk entries kept for audit |
| `banned` | Manual: membership revoked |

Note: State transitions beyond `waitlist` are managed by the [NaN Platform](https://cloud.nan.builders/), not by this website.

## Routes

### Landing Page (`/`)

Static sections, SSR-rendered:

| Section | Component | Hydration |
|---------|-----------|-----------|
| Animated background | `AnimatedBackground.astro` | None (CSS-only) |
| Language switcher | `LanguageSwitcher.astro` | None (link-based ES/EN toggle) |
| Login button | `LoginButton.astro` | None (link to cloud.nan.builders) |
| Hero | `Hero.astro` | None |
| About | `About.astro` | None |
| Server specs | `Server.astro` | None |
| Privacy | `Privacy.astro` | None |
| Model voting | `ModelVoting.astro` | None |
| Agents platform | `Agents.astro` | None |
| Founder | `Founder.astro` | None |
| Pricing | `Pricing.astro` | None |
| CTA + waitlist form | `Cta.astro` + `WaitlistForm.tsx` | `client:load` |
| FAQ | `Faq.astro` + `FaqAccordion.tsx` | `client:visible` |

The community-tier signup page (`/community`) reuses `LanguageSwitcher.astro` and embeds `CommunitySignupForm.tsx` (Preact island, `client:load`) which posts to `/api/community-signup` and redirects to Stripe Checkout on success.

### Documentation (`/docs*`)

| Route | Description |
|-------|-------------|
| `/docs` | Introduction, hardware specs, rates, next steps |
| `/docs/getting-started` | Step-by-step connection guide |
| `/docs/models` | Available model specs |
| `/docs/examples` | Code snippets (Python, Node.js, curl) |
| `/docs/api` | OpenAI-compatible API reference (endpoints, auth, rate limits) |
| `/docs/agents` | Agents platform reference (microVM specs, Hermes, lifecycle) |

### API Endpoints

#### `POST /api/waitlist`

Accepts waitlist signups.

- **Input:** `{ email, region, _hp }` (JSON)
- **Validation:** email format, blocked domains/TLDs, region enum
- **Honeypot:** `_hp` field filled → 200 OK without persisting (bot protection)
- **Rate limit:** 60s per IP via in-memory map (best-effort, resets on isolate eviction)
- **Flow:** `validateWaitlistInput()` → rate limit check → `registerViaBackend()` → cloud-api POST → send confirmation email via Resend (best-effort)
- **EU entries:** take an arrival position assigned by the backend (PostgreSQL sequence)
- **Non-EU entries:** stored as interest signals with position 0
- **Responses:**
  - `200`: `{ ok: true, position, total, status, region }`
  - `400`: `{ ok: false, error: 'invalid_email' | 'invalid_region' }`
  - `429`: `{ ok: false, error: 'rate_limited' }`
  - `500`: `{ ok: false, error: 'server_error' }`

#### `POST /api/community-signup`

Accepts community-tier signups ($14.99/mes) and returns a Stripe Checkout URL.

- **Input:** `{ email, region, _hp }` (JSON)
- **Validation:** email format, blocked domains/TLDs, region enum (`EU` | `LATAM` | `USA`)
- **Honeypot:** `_hp` field filled → 200 OK with a benign URL, nothing persisted
- **Rate limit:** 60s per IP via in-memory map (best-effort, resets on isolate eviction)
- **Flow:** `validateCommunityInput()` → rate limit check → `signupViaBackend()` → cloud-api `POST /api/community/signup` (public, no API key) → backend creates a Stripe Checkout Session and returns its URL
- **Responses:**
  - `200`: `{ ok: true, url }` (Stripe Checkout URL — frontend redirects here)
  - `400`: `{ ok: false, error: 'invalid_email' | 'invalid_region' }`
  - `409`: `{ ok: false, error: 'already_subscribed' }`
  - `429`: `{ ok: false, error: 'rate_limited' }`
  - `500`: `{ ok: false, error: 'server_error' }`

## Internationalization

The landing supports Spanish (default) and English. Catalogs live as JSON files in `i18n/es.json` and `i18n/en.json` and are imported as static modules by `src/lib/i18n.ts`, which exposes `t`, `tArr`, `tObj`, and `getLocale` helpers. Locale is resolved per request from the `?lang=` query parameter (`en` or `es`); anything else falls back to `es`. The `LanguageSwitcher.astro` component is a plain link that toggles the query parameter, so switching languages is a full SSR navigation with zero client JS.

## Security

| Mechanism | Implementation |
|-----------|---------------|
| CSP | Strict policy in `Base.astro` — no external scripts, no frames, no objects |
| Bot protection | Honeypot field (`_hp`) on waitlist form + in-memory rate limiting + backend API key + origin restriction |
| IP detection | `cf-connecting-ip` only (never `x-forwarded-for` on Cloudflare) |
| Secrets | All in Cloudflare Pages dashboard via `wrangler secret put`, never in code |
| Error handling | Intentionally opaque error responses (no internal details leaked) |

## Project Structure

```
website/
├── src/
│   ├── pages/
│   │   ├── index.astro                    # Landing page (SSR)
│   │   ├── community.astro                # Community-tier signup page (SSR)
│   │   ├── api/
│   │   │   ├── waitlist.ts                # POST — waitlist signup
│   │   │   └── community-signup.ts        # POST — community-tier signup (Stripe Checkout)
│   │   └── docs/
│   │       ├── index.astro                # Docs intro
│   │       ├── getting-started.astro      # Getting started guide
│   │       ├── models.astro               # Model specs
│   │       ├── examples.astro             # Code snippets
│   │       ├── api.astro                  # OpenAI-compatible API reference
│   │       └── agents.astro               # Agents platform reference
│   ├── components/
│   │   ├── ui/
│   │   │   └── Button.astro               # Primary/secondary button variants
│   │   ├── landing/
│   │   │   ├── AnimatedBackground.astro   # CSS-only dot grid + orbs
│   │   │   ├── LanguageSwitcher.astro     # Fixed-position ES/EN toggle link
│   │   │   ├── LoginButton.astro          # Fixed-position link to cloud.nan.builders
│   │   │   ├── Hero.astro                 # Title, tagline, CTA
│   │   │   ├── About.astro                # What is NaN
│   │   │   ├── Server.astro               # Hardware specs
│   │   │   ├── Privacy.astro              # Privacy guarantees section
│   │   │   ├── ModelVoting.astro          # Community model voting
│   │   │   ├── Agents.astro               # Agents platform section (microVM, Hermes)
│   │   │   ├── Founder.astro              # Founder profile
│   │   │   ├── Pricing.astro              # Regional pricing cards
│   │   │   ├── Cta.astro                  # CTA section (embeds WaitlistForm)
│   │   │   ├── Faq.astro                  # FAQ section (embeds FaqAccordion)
│   │   │   ├── WaitlistForm.tsx           # Preact island — waitlist signup form
│   │   │   ├── CommunitySignupForm.tsx    # Preact island — community-tier signup form
│   │   │   ├── FaqAccordion.tsx           # Preact island — FAQ accordion
│   │   │   ├── waitlistForm.helpers.ts    # Client-side validation + messages
│   │   │   └── waitlistForm.helpers.test.ts  # Vitest tests for helpers
│   │   └── docs/
│   │       ├── CodeBlock.astro            # Code blocks with copy button
│   │       └── RateLimits.astro           # Rate limit display component
│   ├── lib/
│   │   ├── waitlist.ts                    # Waitlist validation + backend registration
│   │   ├── communitySignup.ts             # Community-tier validation + Stripe Checkout backend call
│   │   ├── i18n.ts                        # Translation helpers (`t`, `tArr`, `tObj`, `getLocale`)
│   │   └── email.ts                       # Resend confirmation email
│   ├── layouts/
│   │   ├── Base.astro                     # Base layout (head, meta, CSP, landing sections)
│   │   └── Docs.astro                     # Docs layout (sidebar, TOC, nav)
│   ├── styles/
│   │   └── global.css                     # Tailwind @theme, docs typography, utilities
│   └── env.d.ts                           # Cloudflare env type declarations
├── i18n/
│   ├── es.json                            # Spanish catalog (default)
│   └── en.json                            # English catalog
├── public/
│   ├── _routes.json                       # Cloudflare routing rules
│   ├── favicon.svg
│   ├── favicon.ico
│   └── founder.jpg
├── astro.config.mjs                       # Astro config (SSR, Cloudflare adapter, Preact, Tailwind)
├── wrangler.jsonc                         # Cloudflare Workers config
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .env.example                           # Template for local dev (.env is gitignored)
```

## Environment Variables

### Runtime (declared in `src/env.d.ts`)

| Variable | Type | Purpose |
|----------|------|---------|
| `RESEND_API_KEY` | `string` | Resend transactional email API key |
| `RESEND_FROM_EMAIL` | `string` | Email sender address |
| `CLOUD_API_URL` | `string` | Backend API base URL (e.g. `https://cloud-api.nan.builders`) |
| `CLOUD_API_WAITLIST_KEY` | `string` | API key for waitlist registration endpoint |

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

Tests are in `src/**/*.test.ts` files:
- `src/tests/api/waitlist.test.ts` — waitlist API endpoint tests
- `src/tests/api/community-signup.test.ts` — community signup API endpoint tests
- `src/tests/lib/waitlist.test.ts` — waitlist core logic tests
- `src/tests/lib/email.test.ts` — email helper tests
- `src/lib/communitySignup.test.ts` — community signup core logic tests
- `src/components/landing/waitlistForm.helpers.test.ts` — client-side form helpers tests

## Cost Estimate

| Resource | Free tier | Expected usage |
|----------|-----------|---------------|
| Cloudflare Pages | Unlimited deploys, 500 builds/month | More than enough |
| Workers | 100K requests/day | Negligible usage |
| Resend | 3,000 emails/month | A few per month |
| Domain | — | Already owned (nan.builders) |

**Estimated infrastructure cost: $0/month**
