import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../pages/install';

/**
 * GET /install, the URL `curl -fsSL https://nan.builders/install | bash` hits.
 *
 * The caller is a shell, not a browser, which is what these asserts are really
 * about: whatever comes back gets executed. A 404 page, an HTML error, or an
 * empty body from a redirect the caller did not follow are all failures that
 * look fine in a browser and do nothing (or worse) in a terminal.
 *
 * The upstream fetch is stubbed so the suite does not depend on GitHub being
 * reachable, and so the failure paths can actually be exercised.
 */

const SCRIPT = '#!/usr/bin/env bash\nset -euo pipefail\necho installing\n';

const call = () => GET({} as never);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /install', () => {
  it('serves the upstream script as a shell script', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SCRIPT, { status: 200 })));

    const res = await call();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/x-shellscript/);
    expect(await res.text()).toBe(SCRIPT);
  });

  it('reads the script from the CLI repo instead of keeping a copy here', async () => {
    const fetchMock = vi.fn(async () => new Response(SCRIPT, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await call();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('helmcode/nan-cli');
  });

  /**
   * A body without a shebang means the upstream answered with something that
   * is not the installer. Piped into bash it runs line by line, so it is
   * refused rather than passed on.
   */
  it('refuses a body that is not a script', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<!doctype html><title>404</title>', { status: 200 })),
    );

    const res = await call();

    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('<!doctype');
  });

  it('answers an upstream failure with a script that exits non-zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));

    const res = await call();
    const body = await res.text();

    expect(res.status).toBe(503);
    expect(body.startsWith('#!')).toBe(true);
    expect(body).toContain('exit 1');
    // The person running the one-liner needs somewhere to go next.
    expect(body).toContain('github.com/helmcode/nan-cli');
  });

  it('answers a network failure the same way', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const res = await call();

    expect(res.status).toBe(503);
    expect((await res.text()).startsWith('#!')).toBe(true);
  });

  /** An edge cache holding a stale installer is the kind of thing nobody checks. */
  it('does not let the installer be cached for long', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SCRIPT, { status: 200 })));

    const res = await call();

    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
  });
});
