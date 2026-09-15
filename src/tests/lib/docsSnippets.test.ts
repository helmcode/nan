import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * The snippets in the guides are code a member pastes into a terminal. Nothing
 * in this repo runs them, so a broken one stays broken until somebody reports
 * it - and the two this file was written for survived a reviewer, a
 * translation into Spanish, and three months of the page being the first hit
 * for "nan builders api example":
 *
 *  1. The embeddings example ended with `print(len(embeddings[0]))  // 4096`,
 *     copied from the JavaScript block next to it. In Python `//` is floor
 *     division, not a comment: the line prints, then evaluates `None // 4096`
 *     and raises `TypeError`. It is not even a syntax error, so no parser
 *     catches it - only running it does.
 *
 *  2. The Whisper example in Node imported `form-data`, built a `FormData`,
 *     appended the file to it and then never used it: the OpenAI SDK takes
 *     the stream directly. The page tells the reader to `npm install openai`
 *     and nothing else, so the snippet failed on the import line for anyone
 *     who pasted it exactly as published.
 *
 * Both are the same shape of failure: a snippet that looks right on the page
 * and breaks on the reader's machine. The two rules below are the mechanical
 * residue of each.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CONTENT = resolve(here, '../../content');
const LOCALES = ['docs', 'docs-es'] as const;

interface CodeBlock {
  lang: string;
  body: string;
  /** 1-indexed line of the opening fence, so a failure names a place to go. */
  line: number;
}

interface DocsPage {
  id: string;
  text: string;
  blocks: CodeBlock[];
}

/**
 * CRLF out, always. This repo is written on Windows with `core.autocrlf=true`,
 * so the committed blob is LF while the working tree is CRLF; every pattern
 * here is anchored on `\n`. Without this the suite passes in CI and fails on
 * the machine of the person who just edited the page.
 */
function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function pages(): DocsPage[] {
  const out: DocsPage[] = [];
  for (const locale of LOCALES) {
    const dir = resolve(CONTENT, locale);
    for (const file of readdirSync(dir).filter((f) => /\.mdx?$/.test(f))) {
      const text = normalize(readFileSync(resolve(dir, file), 'utf-8'));
      out.push({ id: `${locale}/${file}`, text, blocks: codeBlocks(text) });
    }
  }
  return out;
}

function codeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const lines = text.split('\n');
  let open: { lang: string; line: number; body: string[] } | null = null;
  lines.forEach((line, i) => {
    const fence = /^```([a-zA-Z0-9]*)\s*$/.exec(line);
    if (!fence) {
      if (open) open.body.push(line);
      return;
    }
    if (open) {
      blocks.push({ lang: open.lang, body: open.body.join('\n'), line: open.line });
      open = null;
    } else {
      open = { lang: fence[1].toLowerCase(), line: i + 1, body: [] };
    }
  });
  return blocks;
}

/** Everything a `"` or `'` string holds is data, not code, to these rules. */
function stripStrings(line: string): string {
  return line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

const ALL_PAGES = pages();

const PY = new Set(['python', 'py']);
const JS = new Set(['javascript', 'js', 'typescript', 'ts']);

describe('Examples covers every kind of model the cluster serves', () => {
  /**
   * "One complete call for each kind of model" is a promise /docs/choose-a-model
   * makes about this page by name. It was false: `flux-2-klein` had been served
   * for weeks and the page had no image example in either language, so the only
   * way to find out how to call `/images/generations` was the API reference.
   *
   * The rule is per KIND, not per model, because that is what the page is: the
   * seven LLMs share `/chat/completions` and one of them standing for the rest
   * is the point of an examples page. Everything outside that category has its
   * own endpoint and its own payload - embeddings, reranking, speech, audio,
   * images - so each one needs its own section or a reader has nothing to copy.
   */
  const catalogue = JSON.parse(
    readFileSync(resolve(here, '../../data/modelos.json'), 'utf-8'),
  ) as { categorias: Array<{ id: string; modelos: Array<{ id: string }> }> };

  const ownEndpoint = catalogue.categorias
    .filter((c) => c.id !== 'llm')
    .flatMap((c) => c.modelos.map((m) => m.id));

  const llms = catalogue.categorias.find((c) => c.id === 'llm')!.modelos.map((m) => m.id);

  function sections(locale: string): string[] {
    const text = normalize(readFileSync(resolve(CONTENT, locale, 'examples.md'), 'utf-8'));
    return [...text.matchAll(/^## model: (\S+)$/gm)].map((m) => m[1]);
  }

  test.each(LOCALES)('%s/examples.md has a section per endpoint family', (locale) => {
    const published = sections(locale);
    const missing = ownEndpoint.filter((id) => !published.includes(id));
    expect(
      missing,
      `${locale}: served with an endpoint of its own and no example to copy: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  test.each(LOCALES)('%s/examples.md leads with an LLM from the catalogue', (locale) => {
    const published = sections(locale);
    expect(llms).toContain(published[0]);
  });

  test.each(LOCALES)('%s/examples.md names no model the catalogue does not serve', (locale) => {
    const known = new Set([...llms, ...ownEndpoint]);
    const stale = sections(locale).filter((id) => !known.has(id));
    expect(stale, `${locale}: example for a model that is not in the catalogue`).toEqual([]);
  });
});

describe('python snippets do not carry JavaScript comments', () => {
  /**
   * THIS RULE MATCHES THE SHAPE, NOT THE SEMANTICS, and it is worth being
   * explicit about why that is enough.
   *
   * `len(x) // 2` is legitimate Python and stays legitimate here: floor
   * division is written with ONE space on each side, the way PEP 8 writes
   * every binary operator. What the bug looked like was
   * `print(len(embeddings[0]))  // 4096` - two spaces, which is how a trailing
   * comment is aligned, and which is exactly what the JavaScript block above it
   * used. No parser can tell those two apart (both are valid syntax), so the
   * alignment is the only signal there is, and it is the one that travels when
   * somebody copies a line from the block next door.
   */
  const OFFENDING = /\S {2,}\/\//;

  test.each(ALL_PAGES.filter((p) => p.blocks.some((b) => PY.has(b.lang))).map((p) => p.id))(
    '%s',
    (id) => {
      const page = ALL_PAGES.find((p) => p.id === id)!;
      const hits: string[] = [];
      for (const block of page.blocks.filter((b) => PY.has(b.lang))) {
        block.body.split('\n').forEach((line, i) => {
          const code = stripStrings(line).split('#')[0];
          if (OFFENDING.test(code)) hits.push(`line ${block.line + 1 + i}: ${line.trim()}`);
        });
      }
      expect(
        hits,
        `${id}: a Python comment starts with '#'. '//' there is floor division and ` +
          `evaluates at runtime:\n${hits.join('\n')}`,
      ).toEqual([]);
    },
  );
});

describe('every package a snippet imports is a package the page installs', () => {
  /**
   * The reader's contract with the page is the install line. A snippet that
   * imports anything else fails on their machine at the import, before it ever
   * reaches the API - and it fails for a reason the page never mentions, which
   * is the worst kind: nothing on screen connects the error to the docs.
   *
   * Standard library and Node builtins are exempt because there is nothing to
   * install; `fs` in the Whisper example was always fine, `form-data` never
   * was.
   */
  const NODE_BUILTINS = new Set([
    'assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http', 'https',
    'os', 'path', 'process', 'readline', 'stream', 'url', 'util', 'zlib',
  ]);
  const PY_STDLIB = new Set([
    'base64', 'dataclasses', 'io', 'json', 'os', 'pathlib', 're', 'sys', 'textwrap',
    'time', 'typing', 'wave',
  ]);

  /** `@scope/pkg/sub` -> `@scope/pkg`, `openai/shims` -> `openai`. */
  function packageOf(specifier: string): string {
    const parts = specifier.split('/');
    return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  }

  function imported(page: DocsPage): string[] {
    const found = new Set<string>();
    for (const block of page.blocks) {
      if (JS.has(block.lang)) {
        for (const m of block.body.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
          const spec = m[1];
          if (spec.startsWith('.') || spec.startsWith('node:')) continue;
          const pkg = packageOf(spec);
          if (!NODE_BUILTINS.has(pkg)) found.add(pkg);
        }
        for (const m of block.body.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) {
          const spec = m[1];
          if (spec.startsWith('.') || spec.startsWith('node:')) continue;
          const pkg = packageOf(spec);
          if (!NODE_BUILTINS.has(pkg)) found.add(pkg);
        }
      }
      if (PY.has(block.lang)) {
        for (const m of block.body.matchAll(/^\s*(?:from|import)\s+([A-Za-z_][\w.]*)/gm)) {
          const pkg = m[1].split('.')[0];
          if (!PY_STDLIB.has(pkg)) found.add(pkg);
        }
      }
    }
    return [...found];
  }

  /**
   * Install lines are read off the WHOLE page, code fences included: the
   * quickstart writes them as a comment inside the snippet (`# pip install
   * openai`) and Examples writes them as prose underneath it. Both are an
   * instruction the reader sees, which is the only thing that matters here.
   */
  function installed(page: DocsPage): Set<string> {
    const names = new Set<string>();
    for (const m of page.text.matchAll(/\b(?:npm install|npm i|yarn add|pnpm add|pip install|pip3 install|uv add)\s+([^\n`]+)/g)) {
      for (const raw of m[1].split(/\s+/)) {
        const token = raw.replace(/^["']|["'].*$/g, '').replace(/\[.*$/, '');
        if (!token || token.startsWith('-')) continue;
        names.add(packageOf(token));
      }
    }
    return names;
  }

  const withImports = ALL_PAGES.filter((p) => imported(p).length > 0);

  test('at least one page imports something, or these rules guard nothing', () => {
    expect(withImports.length).toBeGreaterThan(0);
  });

  test.each(withImports.map((p) => p.id))('%s', (id) => {
    const page = ALL_PAGES.find((p) => p.id === id)!;
    const have = installed(page);
    const missing = imported(page).filter((pkg) => !have.has(pkg));
    expect(
      missing,
      `${id}: imported but never installed on the page: ${missing.join(', ')}. ` +
        `Either add it to the install line or take the import out.`,
    ).toEqual([]);
  });
});

/**
 * The two shapes a collapsed escape leaves behind.
 *
 * `%LOCALAPPDATA%\Programs\nan` and `-InstallDir "C:\tools"` were published on
 * /docs/nan-cli with their `\n` and their `\t` already spent: the first arrived
 * as a real line break mid-path ("Programs" / "an"), the second as a tab
 * ("C:<TAB>ools"). Both survived review in two languages because a Windows path
 * is the one string nobody on this team pastes back, and neither is a syntax
 * error anywhere - the PowerShell line runs perfectly, it just installs
 * somewhere else.
 *
 * Nothing above caught them: those rules run the snippets, and a snippet that
 * runs is all they ask for. These two look at the residue instead.
 */
describe('escapes that were spent before they reached the page', () => {
  /**
   * A tab in a Markdown source is either a collapsed `\t` or an indentation
   * nobody can see. Neither is worth keeping, so the rule is the whole file
   * rather than the paths: it costs nothing and it does not need to guess which
   * strings are Windows.
   */
  test.each(ALL_PAGES.map((p) => p.id))('%s carries no literal tab', (id) => {
    const page = ALL_PAGES.find((p) => p.id === id)!;
    const hits = page.text
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => line.includes('\t'))
      .map(({ line, n }) => `${n}: ${line.replace(/\t/g, '<TAB>').trim()}`);
    expect(
      hits,
      `${id}: a literal tab, which is what a \t looks like once something has ` +
        `interpreted it:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  /**
   * A `\n` inside inline code leaves a sharper mark than a stray line break: it
   * splits the span across two lines, so each of them carries an odd number of
   * backticks. Markdown does allow a span to wrap, but no guide here writes one
   * that way, so the odd count is the collapsed escape every time.
   *
   * Fenced blocks are skipped - their backticks are the fence.
   */
  test.each(ALL_PAGES.map((p) => p.id))('%s closes every inline code span', (id) => {
    const page = ALL_PAGES.find((p) => p.id === id)!;
    let inFence = false;
    const hits: string[] = [];
    page.text.split('\n').forEach((line, i) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;
      const ticks = (line.match(/`/g) ?? []).length;
      if (ticks % 2 === 1) hits.push(`${i + 1}: ${line.trim()}`);
    });
    expect(
      hits,
      `${id}: an inline code span opens on one line and closes on another, ` +
        `which is what a \n looks like once it has become a line break:\n${hits.join('\n')}`,
    ).toEqual([]);
  });
});

/**
 * "OpenAI-compatible" said about something OpenAI does not define.
 *
 * `/rerank` closed with "the endpoint is OpenAI-compatible in authentication
 * and payload format". Half of that is true and useful - the Bearer header is
 * the same one - and half of it promises a spec to go and read that does not
 * exist: OpenAI has no `/rerank`, so there is no payload to be compatible
 * with. The body is ours.
 *
 * The page already knew: three lines above, in the snippet's own comment, it
 * says the endpoint "is not part of the standard OpenAI client". And `/search`,
 * the other endpoint of ours in the same file, already closes the right way -
 * "send the JSON body with your Bearer key". So the rule is the page against
 * itself: whatever it flags as outside the standard client cannot be sold two
 * paragraphs later as compatible in its payload.
 */
describe('endpoints that are ours are not described as OpenAI-compatible', () => {
  const OUTSIDE = /not part of the standard OpenAI client/i;
  /** Authentication genuinely is compatible; it is the body that is not. */
  const PAYLOAD_CLAIM = /compatible[^.]*\b(payload|body|cuerpo|formato del cuerpo)\b/i;

  test.each(['docs', 'docs-es'] as const)('%s/examples.md', (locale) => {
    const text = normalize(readFileSync(resolve(CONTENT, locale, 'examples.md'), 'utf-8'));
    const sections = text.split(/\n(?=## )/);
    const guilty = sections
      .filter((s) => OUTSIDE.test(s) && PAYLOAD_CLAIM.test(s))
      .map((s) => `${s.split('\n')[0]}: ${PAYLOAD_CLAIM.exec(s)![0]}`);
    expect(
      guilty,
      `${locale}/examples.md: the page says these endpoints are outside the ` +
        `standard OpenAI client and then calls their payload compatible with ` +
        `it:\n${guilty.join('\n')}`,
    ).toEqual([]);
  });
});
