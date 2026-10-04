import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

/**
 * Member-facing copy must not disclose how the platform is built underneath
 * (virtualization stack, hypervisor, host names, backup tooling, hosting
 * provider). Members read "workspace", "private cloud machine", "backups".
 *
 * Covers every docs page (EN + ES) and the legal pages. Kubernetes is not on
 * the list on purpose: Spaces hand members a kubeconfig, so it is the product,
 * not an implementation detail. LiteLLM is not either: the Claude Code guide
 * tells members to run it on their own machine.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../..');

const FORBIDDEN =
  /firecracker|micro-?vms?\b|qemu|\bkvm\b|kubelet|cadvisor|cloud-hypervisor|jailer|restic|hetzner|nan-eu0\d\d|\beu00\d\b|nan-vmd|\bkata\b/i;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = [
  ...walk(join(src, 'content/docs')),
  ...walk(join(src, 'content/docs-es')),
  ...['terms', 'privacy', 'cookies'].flatMap((page) => [
    join(src, `pages/${page}.astro`),
    join(src, `pages/es/${page}.astro`),
  ]),
].filter((p) => /\.(md|mdx|astro)$/.test(p));

describe('member-facing copy does not disclose infrastructure internals', () => {
  test('there are pages to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  test.each(files.map((f) => [f.slice(src.length + 1), f]))('%s', (_rel, file) => {
    const text = readFileSync(file, 'utf8');
    const hit = text.match(FORBIDDEN);
    expect(hit?.[0] ?? null).toBeNull();
  });

  test('the agents guide describes the machine in product terms', () => {
    const en = readFileSync(join(src, 'content/docs/agents.md'), 'utf8');
    const es = readFileSync(join(src, 'content/docs-es/agents.md'), 'utf8');
    expect(en).toContain('your own **private cloud machine**');
    expect(es).toContain('tu propia **máquina privada en la nube**');
  });
});
