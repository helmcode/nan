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
 * v0.1.4 and not v0.1.3, which is where this script was first published and
 * where it did not work. Two PowerShell 5.1 faults, both found the first time
 * it was pointed at a published release: an `Invoke-WebRequest` without
 * `-UseBasicParsing`, which throws where the Internet Explorer engine is
 * absent, and `checksums.txt` read off a response body that PowerShell hands
 * back as a `Byte[]` because GitHub serves release assets as
 * application/octet-stream. Both are fixed in v0.1.4, which was then run end
 * to end on Windows 11 against the real release.
 *
 * v0.1.5 and not v0.1.4, because v0.1.4's script closed the terminal it ran
 * in. `iex` executes in the CURRENT session, so the `exit 1` on every failure
 * path ended the session rather than the script: the tab shut instantly and
 * took the error message with it. Reported from Warp, reproduced, and fixed in
 * helmcode/nan-cli#6, where the body became a function that throws.
 *
 * v0.1.6 fixes the third one: the script asked RuntimeInformation for the
 * architecture and believed the silence, so on a machine where that .NET type
 * is out of reach - ConstrainedLanguage mode under an AppLocker or WDAC policy,
 * or anything before .NET Framework 4.7.1 - an ordinary x64 box was told it was
 * an unsupported architecture. It reads the environment as well now.
 *
 * v0.1.7 is the first one that says what to do after it finishes. Until it,
 * the script ended on "Run nan to get started" - true, printed from a shell
 * that could not find `nan` yet, and silent about signing in, which is a
 * subcommand nobody had mentioned. It ends on a numbered list now.
 *
 * If this tag ever stops existing, the upstream fetch 404s and the route
 * answers with the error script below - the correct degraded behaviour for
 * something piped into `iex`.
 */
const SCRIPT_URL =
  'https://raw.githubusercontent.com/helmcode/nan-cli/v0.1.16/scripts/install.ps1';

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
