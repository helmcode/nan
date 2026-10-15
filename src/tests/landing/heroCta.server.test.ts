import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDocsApiServer, type DocsApiServer } from '../helpers/docsApiServer';

/**
 * The real SSR output of the home: the hero CTA carries ?plan= from the
 * landing URL (and maps the legacy ?premium=1), and the removed /api/signup
 * route is gone (404), not silently accepting posts.
 */

let server: DocsApiServer;
const pages = new Map<string, string>();
const PATHS = ['/', '/es', '/?plan=workspace', '/es?premium=1', '/?plan=gold'];
let signupStatus = 0;

beforeAll(async () => {
  server = await startDocsApiServer();
  for (const p of PATHS) {
    const res = await server.fetch(p);
    expect(res.status, p).toBe(200);
    pages.set(p, await res.text());
  }
  const res = await server.fetch('/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: 'Ada', email: 'ada@helmcode.com', jobRole: 'founder' }),
  });
  signupStatus = res.status;
}, 180_000);

afterAll(async () => {
  await server?.stop();
});

/** The <header class="hero"> block of a page. */
function heroOf(path: string): string {
  const html = pages.get(path) ?? '';
  const start = html.indexOf('class="hero"');
  return html.slice(start, html.indexOf('</header>', start));
}

describe('home hero (SSR)', () => {
  it('renders no form', () => {
    for (const p of PATHS) expect(heroOf(p), p).not.toMatch(/<form|<input/);
  });

  it('links Create account to the platform signup and Log in to the platform', () => {
    expect(heroOf('/')).toContain('href="https://cloud.nan.builders/signup"');
    expect(heroOf('/')).toContain('href="https://cloud.nan.builders/"');
    expect(heroOf('/')).toContain('Create account');
    expect(heroOf('/es')).toContain('Crear cuenta');
    expect(heroOf('/es')).toContain('Entrar');
  });

  it('carries ?plan= and maps ?premium=1', () => {
    expect(heroOf('/?plan=workspace')).toContain('href="https://cloud.nan.builders/signup?plan=workspace"');
    expect(heroOf('/es?premium=1')).toContain('href="https://cloud.nan.builders/signup?plan=premium"');
    expect(heroOf('/?plan=gold')).toContain('href="https://cloud.nan.builders/signup"');
    expect(heroOf('/?plan=gold')).not.toContain('gold');
  });
});

describe('removed route', () => {
  it('POST /api/signup is a 404', () => {
    expect(signupStatus).toBe(404);
  });
});
