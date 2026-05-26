# Contributing to NaN

Thanks for your interest in contributing! We favor small, focused PRs and clear
intent over big bangs. This guide explains how to get set up and the workflow
we use.

## Quick Start

Prerequisites

- **Node.js 22.12.0+**
- npm
- Git

Setup

```bash
git clone https://github.com/<you>/nan.git
cd nan
npm install
npm run dev
```

The site is built with Astro 6 (SSR on Cloudflare Pages), Preact for
interactive islands, Tailwind CSS v4, and TypeScript.

## Development Workflow

1. **Create a feature branch**

   ```
   git checkout -b feat/<short-slug>
   ```

2. **Make changes and keep PRs small and focused**

   - Prefer a series of small PRs over one large one.
   - Include screenshots/GIFs when modifying UI.

3. **Run the same checks CI runs, locally**

   ```bash
   npm test           # Vitest (must pass)
   npx astro check    # TypeScript / Astro type-check (must pass)
   npm run build      # Production build (must pass)
   ```

   These three steps are what `.github/workflows/ci.yml` runs on every PR.
   Run them locally before requesting review.

4. **Commit using Conventional Commits**

   - `feat:` / `fix:` / `chore:` / `refactor:` / `docs:` / `perf:` / `test:` ...

   Example: `fix(docs): correct slug regex in manifest endpoint`

5. **Open a Pull Request**

   - Describe the change, rationale, and testing steps.
   - Link related Issues.
   - Keep the PR title in Conventional Commit format.

## Testing

**Every new feature, fix, or refactor must ship with tests.** PRs that add
functionality without tests will not be merged.

- The project uses [Vitest](https://vitest.dev/).
- Tests live either **co-located** with the code they cover
  (`src/lib/foo.ts` + `src/lib/foo.test.ts`) or **grouped under `src/tests/`**
  by area (`src/tests/lib/`, `src/tests/api/`). Follow the pattern that
  already exists in the area you're touching.
- For API endpoints: cover input validation (4xx paths), happy-path response
  shape, and cache headers (`ETag`, `If-None-Match` → 304 where applicable).
- For utilities: cover edge cases (empty input, UTF-8, malformed input) with
  explicit fixtures.

```bash
npm test            # one-shot
npm run test:watch  # watch mode
```

## Code Style

- Follow the existing style in the codebase.
- Prefer Astro components for static page-level UI; use Preact islands only
  when interactivity is needed, and pick the lightest hydration directive
  that works (`client:idle` / `client:visible` over `client:load`).
- Aim for accessible elements (`aria-*`, labels, semantic HTML).
- Never commit secrets, API keys, Stripe keys, Discord tokens, or session
  secrets. Use `.env` locally (gitignored) and the Cloudflare Pages dashboard
  for production.

## Issue Reports and Feature Requests

Use GitHub Issues. Include browser/OS, steps to reproduce, relevant logs, and
screenshots/GIFs for UI issues.
