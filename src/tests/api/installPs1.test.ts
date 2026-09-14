import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { GET } from '../../pages/install.ps1';

/**
 * GET /install.ps1, the URL `irm https://nan.builders/install.ps1 | iex` hits.
 *
 * Same contract as /install and the same reason for each assert: whatever comes
 * back is executed. What differs is the shell. A body PowerShell will not take
 * as a string - anything Invoke-RestMethod decides to parse into an object -
 * reaches `iex` as something other than a script, and an HTML error page piped
 * into `iex` runs line by line.
 */

const SCRIPT = '#Requires -Version 5.1\n$ErrorActionPreference = "Stop"\nWrite-Host installing\n';

const call = () => GET({} as never);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /install.ps1', () => {
  it('serves the upstream script as text PowerShell will not try to parse', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SCRIPT, { status: 200 })));

    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SCRIPT);
    // Invoke-RestMethod parses by content type. Anything json-ish here and the
    // caller gets an object where it expected the text of a script.
    expect(res.headers.get('Content-Type')).toContain('text/plain');
  });

  it('reads the script from the CLI repo instead of keeping a copy here', async () => {
    const fetchMock = vi.fn(async () => new Response(SCRIPT, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await call();

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('helmcode/nan-cli');
    expect(url).toContain('scripts/install.ps1');
  });

  it('pins the script to a tag, not to a moving branch', async () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, '../../pages/install.ps1.ts'), 'utf8');
    const url = source.match(/raw\.githubusercontent\.com\/helmcode\/nan-cli\/([^/]+)\//);
    expect(url, 'no upstream URL found in the route').not.toBeNull();
    // Whatever this serves runs on a member's machine. A branch changes under
    // us on any push; a tag is a revision somebody decided to publish.
    expect(url![1], `pinned to ${url![1]}`).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it('refuses a body that is not a script', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><h1>404</h1>', { status: 200 })));

    const res = await call();

    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body.startsWith('#Requires')).toBe(true);
    expect(body).toContain('exit 1');
  });

  it('answers an upstream failure with a script that exits non-zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));

    const res = await call();

    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toContain('upstream 404');
    // The tag this is pinned to may not be cut yet, so this path is the one a
    // member actually meets. It has to name somewhere to go.
    expect(body).toContain('github.com/helmcode/nan-cli/releases');
    expect(body).toContain('exit 1');
  });

  it('answers a network failure the same way', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }));

    const res = await call();

    expect(res.status).toBe(503);
    expect(await res.text()).toContain('exit 1');
  });

  it('does not let the installer be cached for long', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SCRIPT, { status: 200 })));

    const res = await call();

    expect(res.headers.get('Cache-Control')).toContain('max-age=300');
  });
});

/**
 * The two installer routes are pinned by hand, and the pair going out of step
 * is what this whole sequence was about: /install sat on v0.1.1 for three
 * releases, so the fix that tells a member what happened when the GitHub API
 * rate limits them was published and served to nobody.
 *
 * They are not required to name the same tag forever - each moves when its own
 * script changes - but a gap of more than nothing is worth having to justify,
 * so this pins them together and fails loudly when one moves alone.
 */
describe('the two installer routes', () => {
  const pin = (file: string) => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, '../../pages/', file), 'utf8');
    const match = source.match(/raw\.githubusercontent\.com\/helmcode\/nan-cli\/([^/]+)\//);
    expect(match, `no upstream URL in ${file}`).not.toBeNull();
    return match![1];
  };

  it('serve scripts from the same released tag', () => {
    expect(pin('install.ts'), 'the bash and PowerShell installers are pinned to different tags')
      .toBe(pin('install.ps1.ts'));
  });
});
