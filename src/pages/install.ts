import type { APIRoute } from 'astro';

/**
 * `https://nan.builders/install`, the URL the CLI pipes into bash.
 *
 * The README of helmcode/nan-cli has always told people to run
 * `curl -fsSL https://nan.builders/install | bash`, and this site answered 404.
 * A member hit exactly that, fell back to cloning the repo and building it with
 * Go, and only got there after a long detour. The installer is the first thing
 * a new member touches, so a 404 here costs more than it looks.
 *
 * The script itself is NOT copied into this repo. It lives next to the code it
 * installs (scripts/install.sh in nan-cli), and a second copy here would go
 * stale the first time the CLI changes how it lays itself out. This route
 * fetches that one and serves it.
 *
 * It is served rather than redirected to because the whole point is a command
 * that pipes into a shell: a redirect only works if the caller passes `-L`, and
 * a 302 with an empty body piped into bash is a silent no-op, which is worse
 * than an error.
 */

export const prerender = false;

/**
 * Pinned to a RELEASED TAG, not to `main`.
 *
 * Whatever this URL returns runs on a member's machine, under sudo in the
 * default install path. Off `main`, any push to the CLI repo changes that
 * instantly and with no review step in between; a tag is immutable, so what
 * ships here is a revision somebody decided to publish.
 *
 * The cost is that this constant has to be bumped when the CLI changes how it
 * installs itself. That is not the same as bumping it on every release: the
 * script asks the GitHub API for the LATEST release at run time, so a member
 * running an older installer still gets the newest binary. Only a change to
 * `scripts/install.sh` itself needs a bump here.
 *
 * v0.1.4 is the first tag where the script says something useful when the
 * GitHub API rate limits the version lookup. Before it, the empty version went
 * into the archive name and the person saw curl fail on a URL with a hole in
 * it, which explains neither what happened nor what to do.
 */
const SCRIPT_URL =
  'https://raw.githubusercontent.com/helmcode/nan-cli/v0.1.11/scripts/install.sh';

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

  // A shell script that does not start with a shebang is a sign the upstream
  // answered with something else (an HTML error page, a redirect notice). Piped
  // into bash that executes as commands, so it is refused here instead.
  if (!body.startsWith('#!')) {
    return scriptError('install script upstream returned something that is not a script');
  }

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/x-shellscript; charset=utf-8',
      // Short: the point of the one-liner is that it installs the current
      // version, and an edge cache holding a stale installer for a day is the
      // kind of thing nobody thinks to check.
      'Cache-Control': 'public, max-age=300',
    },
  });
};

/**
 * Failure as a script that exits non-zero, not as an HTTP error page.
 *
 * The caller is a shell. An HTML body with a 500 would either be executed line
 * by line or swallowed; a script that echoes the reason and exits 1 is the only
 * form that reaches the person running the command.
 */
function scriptError(message: string): Response {
  const body = `#!/usr/bin/env bash\necho "nan install: ${message}" >&2\necho "Install from source instead: https://github.com/helmcode/nan-cli" >&2\nexit 1\n`;
  return new Response(body, {
    status: 503,
    headers: {
      'Content-Type': 'text/x-shellscript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
