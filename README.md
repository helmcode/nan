# NaN Website

Marketing site and public documentation for [nan.builders](https://nan.builders). Built with Astro 6 (SSR mode) on Cloudflare Workers, Preact islands for interactive components, Tailwind CSS v4, and an ES/EN i18n catalog. The site backs into the `cloud-api` Go service for waitlist registration and community signup, and uses Resend for transactional email.

## Tech stack

- Astro 6 (`output: 'server'`, Cloudflare adapter)
- Preact 10 for client-side islands
- TypeScript (strict)
- Tailwind CSS v4 (Vite plugin)
- `rehype-pretty-code` + Shiki for code highlighting in docs
- `astro-i18n` plus a local helper (`src/lib/i18n.ts`) for ES/EN strings
- Vitest 4 for unit tests
- Cloudflare Workers (assets binding + SSR entrypoint)
- Resend for transactional email
- Node.js `>=22.12.0`, npm (lockfile is `package-lock.json`)

## Architecture

The site is a single Astro app deployed as a Cloudflare Worker. The landing (`/`), the community page (`/community`), and the docs (`/docs/*`) are SSR-rendered at the edge. Two API routes (`/api/waitlist`, `/api/community-signup`) validate input, forward to the `cloud-api` backend, and trigger Resend confirmation email. Interactive bits (waitlist form, community signup form, FAQ accordion) are Preact islands hydrated with `client:load` / `client:visible`. Static assets are served from the `ASSETS` binding configured in `wrangler.jsonc`.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full breakdown of rendering modes, route inventory, security model, and member lifecycle.

## Project structure

```
website/
├── src/
│   ├── pages/
│   │   ├── index.astro              # Landing (SSR)
│   │   ├── community.astro          # Community tier page (SSR)
│   │   ├── api/
│   │   │   ├── waitlist.ts          # POST — waitlist signup
│   │   │   └── community-signup.ts  # POST — community tier signup
│   │   └── docs/                    # SSR docs: index, getting-started, models,
│   │                                #   examples, api, agents
│   ├── components/
│   │   ├── landing/                 # Hero, Pricing, WaitlistForm, FaqAccordion,
│   │   │                            #   LanguageSwitcher, LoginButton, etc.
│   │   ├── docs/                    # CodeBlock, RateLimits
│   │   └── ui/                      # Button
│   ├── layouts/                     # Base, Docs, Page
│   ├── lib/                         # waitlist, communitySignup, email, i18n
│   ├── styles/                      # Tailwind theme + global CSS
│   ├── tests/                       # Vitest suites (api/, lib/)
│   └── env.d.ts                     # Cloudflare env typings
├── i18n/                            # en.json, es.json translation catalogs
├── public/                          # Static assets, favicons, _routes.json
├── .github/workflows/               # ci.yml, deploy.yml
├── astro.config.mjs
├── wrangler.jsonc
├── vitest.config.ts
├── tsconfig.json
└── package.json
```

## Getting started

### Prerequisites

- Node.js `>=22.12.0` (uses native `--env-file=` in scripts)
- npm (the lockfile is `package-lock.json`; do not switch package managers)
- Access to a `cloud-api` instance (default: `https://cloud-api.nan.builders`). Without `CLOUD_API_WAITLIST_KEY` the signup form will fail at the API call, but the site will still render fine for visual work.

### Setup

```bash
git clone <repo>
cd website
npm install
cp .env.example .env
# fill in values (see "Environment variables" below)
npm run dev
```

The dev server runs on `http://localhost:4321`.

### Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `astro dev` | Start the Astro dev server with HMR. |
| `build` | `astro check --quiet \|\| true && astro build && cp public/_routes.json dist/client/` | Type-check (non-blocking), build for Cloudflare Workers, then copy the routing rules into `dist/client/`. |
| `preview` | `astro preview` | Preview the production build locally. |
| `astro` | `astro` | Run the Astro CLI passthrough. |
| `generate-types` | `wrangler types` | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` (file is gitignored). |
| `test` | `vitest run` | Run the full Vitest suite once. |
| `test:watch` | `vitest` | Run Vitest in watch mode. |

## Environment variables

Runtime variables are declared in `src/env.d.ts` and consumed via `Astro.locals.runtime.env` (Cloudflare adapter). Local development reads them from `.env`; production values live in the Cloudflare dashboard (set with `wrangler secret put`).

| Name | Required | Where it's used | Description |
|---|---|---|---|
| `RESEND_API_KEY` | runtime | `src/lib/email.ts` | Resend API key for transactional email (waitlist + community signup confirmation). |
| `RESEND_FROM_EMAIL` | runtime | `src/lib/email.ts` | `From` address used by Resend. |
| `CLOUD_API_URL` | runtime | `src/lib/waitlist.ts`, `src/lib/communitySignup.ts` | Base URL of the `cloud-api` backend (e.g. `https://cloud-api.nan.builders`). |
| `CLOUD_API_WAITLIST_KEY` | runtime | `src/lib/waitlist.ts`, `src/lib/communitySignup.ts` | API key for the `cloud-api` waitlist/community registration endpoints. |

All four are listed (without values) in `.env.example`. You must fill them locally if you want the API routes to work end-to-end. None of these secrets should ever be committed.

## Testing

```bash
npm test         # run all Vitest suites
npm run test:watch
```

Vitest config: [`vitest.config.ts`](./vitest.config.ts). Tests are picked up from `src/**/*.test.ts`. Current suites:

- `src/tests/api/waitlist.test.ts`
- `src/tests/api/community-signup.test.ts`
- `src/tests/lib/waitlist.test.ts`
- `src/tests/lib/email.test.ts`
- `src/lib/communitySignup.test.ts`
- `src/components/landing/waitlistForm.helpers.test.ts`

## Build and local preview

```bash
npm run build    # astro check (non-blocking) → astro build → copy _routes.json
npm run preview  # serve the production build locally
```

`astro check` is invoked with `--quiet` and `|| true` so type warnings do not fail the build; full type checking happens in CI via `npx astro check`.

## Deployment

The site is deployed to Cloudflare Workers under the name `nan-website` (see `wrangler.jsonc`). Pushes to `main` trigger the `Deploy` workflow, which runs tests, builds, and then `npx wrangler deploy`. The production site is served at [https://nan.builders](https://nan.builders).

`wrangler.jsonc` highlights:

- `main: "@astrojs/cloudflare/entrypoints/server"` — Astro's Cloudflare SSR entrypoint.
- `assets: { directory: "./dist", binding: "ASSETS" }` — static assets binding for the Worker.
- `compatibility_date: "2026-03-17"` and `compatibility_flags: ["global_fetch_strictly_public"]` — outbound `fetch` is restricted to public addresses.
- `observability.enabled: true` — Workers observability is on.

All runtime secrets must be set in the Cloudflare dashboard (or via `wrangler secret put`), not in the repository.

## CI/CD

Two GitHub Actions workflows live in `.github/workflows/`:

### `ci.yml` — `CI`

- **Trigger:** `pull_request` to `main`.
- **Job `build-and-test`** (Ubuntu, Node 22, npm cache):
  1. `npm ci`
  2. `npm test`
  3. `npx astro check`
  4. `npm run build`

### `deploy.yml` — `Deploy`

- **Trigger:** `push` to `main`.
- **Job `deploy`** (Ubuntu, Node 22, npm cache, `deployments: write`):
  1. `npm ci`
  2. `npm test`
  3. `npm run build`
  4. `npx wrangler deploy`

Required repository secrets (consumed by `deploy.yml`):

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Internationalization

The site supports Spanish (`es`, default) and English (`en`).

- Translation catalogs: [`i18n/es.json`](./i18n/es.json) and [`i18n/en.json`](./i18n/en.json).
- Helpers: [`src/lib/i18n.ts`](./src/lib/i18n.ts) exports `t(key, locale)` for strings, `tArr` for arrays, `tObj` for nested objects, and `getLocale(URLSearchParams)` which reads the `?lang=` query param and defaults to `es`.
- Locale switcher UI: [`src/components/landing/LanguageSwitcher.astro`](./src/components/landing/LanguageSwitcher.astro), embedded in `Base.astro` and on `/community`.

To add a new string, add the key (matching the dotted path used in `t(...)`) to both `i18n/es.json` and `i18n/en.json`, then reference it from the component with `t('your.key', locale)`. Both catalogs must stay in structural sync.

## Contributing

- Branch from `main` and open a PR.
- Commit messages follow Conventional Commits (`feat(scope): ...`, `fix(scope): ...`, `docs(scope): ...`). Match the existing `git log` style.
- CI must be green: `npm test`, `npx astro check`, and `npm run build` all pass.
- For UI changes, run `npm run dev` and smoke-test the affected flows before requesting review.
- Never commit secrets or any `.env` file.
