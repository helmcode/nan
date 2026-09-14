import type { APIRoute } from 'astro';

/**
 * `https://nan.builders/install.ps1`, the Windows half of /install.
 *
 * The CLI shipped linux and darwin binaries only, so the answer on Windows was
 * to clone the repo and have Go installed. The release now builds windows
 * amd64 and arm64 as .zip archives, and this is what turns those into a
 * one-liner:
 *
 *   irm https://nan.builders/install.ps1 | iex
 *
 * Same shape as /install and for the same reasons: the script is not copied
 * into this repo, it is fetched from the tag next to the code it installs, and
 * a failure is answered with a script that exits rather than with an HTTP error
 * page. The caller is a shell in both cases; only the shell differs.
 */

export const prerender = false;

/**
 * Pinned to a RELEASED TAG, exactly as /install is, and for the same reason:
 * whatever this URL returns runs on a member's machine.
 *
 * This tag has to exist for the route to serve anything. Until it is cut, the
 * upstream fetch 404s and the route answers with the error script below, which
 * tells the person what happened and where to download by hand - the correct
 * degraded behaviour for something piped into `iex`, and better than this
 * route not existing at all.
 *
 * /install is deliberately NOT bumped in step: it is pinned to v0.1.1, that
 * script still works, and moving it before the tag exists would break an
 * install path that works today in order to improve one that does not exist
 * yet. Both pins move to the same tag once v0.1.3 is published.
 */
const SCRIPT_URL =
  'https://raw.githubusercontent.com/helmcode/nan-cli/v0.1.3/scripts/install.ps1';

export const GET: APIRoute = async () => {
  let upstream: Response;
  try {
    upstream = await fetch(SCRIPT_URL);
  } catch {
    return scriptError('could not reach the install script upstream');
  }

  if (!upstream.ok) {
    return scriptError(`install script unavailable (upstream ${upstream.status})`);
  }

  const body = await upstream.text();

  // The PowerShell equivalent of the shebang check on /install: a body that
  // does not open with the `#Requires` line is a sign the upstream answered
  // with something else - an HTML error page, a redirect notice - and piped
  // into `iex` that is executed as commands.
  if (!body.startsWith('#Requires')) {
    return scriptError('install script upstream returned something that is not a script');
  }

  return new Response(body, {
    status: 200,
    headers: {
      // Not application/json or anything Invoke-RestMethod would try to parse:
      // `irm | iex` needs a string back, and text/plain is what gives it one.
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};

/**
 * Failure as PowerShell that writes to stderr and exits, not as an HTTP error
 * page. `iex` on an HTML body runs it line by line.
 */
function scriptError(message: string): Response {
  const body = [
    '#Requires -Version 5.1',
    `Write-Error "nan install: ${message}"`,
    'Write-Error "Download the .zip by hand instead: https://github.com/helmcode/nan-cli/releases/latest"',
    'exit 1',
    '',
  ].join('\n');
  return new Response(body, {
    status: 503,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
