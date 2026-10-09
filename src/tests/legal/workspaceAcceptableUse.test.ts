import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Workspace acceptable use policy (Workspaces general launch, 2026-10-06).
 *
 * Every paying member can now run a machine with outbound internet access, so
 * the terms have to say what that machine may not be used for, what happens on
 * abuse, and that deletion takes the backups too. The docs and the pricing page
 * link to `#workspace-acceptable-use`, so the anchor is part of the contract.
 */
const here = dirname(fileURLToPath(import.meta.url));
const pages = resolve(here, '../../pages');
const flat = (p: string) => readFileSync(resolve(pages, p), 'utf-8').replace(/\s+/g, ' ');

/** The section's text: from its heading to the next h2, tags stripped. */
function section(src: string): string {
  const start = src.indexOf('<h2 id="workspace-acceptable-use">');
  expect(start, 'workspace-acceptable-use heading present').toBeGreaterThan(-1);
  const end = src.indexOf('<h2', start + 1);
  return src.slice(start, end).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
}

const cases = {
  en: {
    file: 'terms.astro',
    heading: 'Workspace acceptable use',
    since: 'This section applies from October 6, 2026',
    prohibited: [
      'mine cryptocurrency',
      "scan, probe or attack third-party systems, other members' workspaces or our own infrastructure",
      'denial-of-service (DDoS)',
      'send spam, run phishing, or host or distribute malware',
      'run open proxies, offer VPN services to others, or run Tor exit or relay nodes',
      'credential stuffing',
      'illegal content',
      "resell, sublet or share the workspace's compute",
    ],
    tunnels: 'Reverse tunnels are allowed only to give you access to your own workspace and for your own development use, and never to expose any of the services or activities listed above',
    smtp: 'Outgoing email (SMTP) is blocked',
    abuse: 'we may suspend or delete the workspace, its backups and the slots involved without prior notice',
    refund: 'A suspension or deletion for abuse gives no right to a refund',
    reports: 'We cooperate with abuse reports',
    deletion: 'its disk and all its backups are deleted permanently and cannot be recovered',
  },
  es: {
    file: 'es/terms.astro',
    heading: 'Uso aceptable de los workspaces',
    since: 'Este apartado se aplica desde el 6 de octubre de 2026',
    prohibited: [
      'minar criptomonedas',
      'escanear, sondear o atacar sistemas de terceros, workspaces de otros miembros o nuestra propia infraestructura',
      'denegación de servicio (DDoS)',
      'enviar spam, hacer phishing, ni alojar o distribuir malware',
      'ofrecer proxies abiertos o servicios de VPN a terceros, ni ejecutar nodos de salida o relés de Tor',
      'credential stuffing',
      'contenido ilegal',
      'revender, subarrendar o compartir con terceros la capacidad de cómputo',
    ],
    tunnels: 'Los túneles inversos solo están permitidos para darte acceso a tu propio workspace y para tu propio uso de desarrollo, y nunca para exponer ninguno de los servicios o actividades anteriores',
    smtp: 'El correo saliente (SMTP) está bloqueado',
    abuse: 'podemos suspender o eliminar el workspace, sus copias de seguridad y los slots implicados sin aviso previo',
    refund: 'La suspensión o eliminación por abuso no da derecho a reembolso',
    reports: 'Colaboramos con los avisos de abuso',
    deletion: 'su disco y todas sus copias de seguridad se borran de forma permanente y no se pueden recuperar',
  },
} as const;

describe.each(Object.entries(cases))('terms: workspace acceptable use (%s)', (_locale, c) => {
  const src = flat(c.file);
  const s = section(src);

  test('has its own section, after membership and payments', () => {
    expect(s.startsWith(c.heading)).toBe(true);
    expect(src.indexOf('id="workspace-acceptable-use"')).toBeGreaterThan(src.indexOf('id="workspace-backups"'));
  });

  test('marks the date it applies from, and the page date moved with it', () => {
    expect(s).toContain(c.since);
    expect(src).toContain('updated="October 6, 2026"');
  });

  test.each(c.prohibited)('prohibits: %s', (item) => {
    expect(s).toContain(item);
  });

  test('allows reverse tunnels only for own access and development', () => {
    expect(s).toContain(c.tunnels);
    expect(s).toContain(c.smtp);
  });

  test('suspension or deletion without notice and without refund on abuse', () => {
    expect(s).toContain(c.abuse);
    expect(s).toContain(c.refund);
    expect(s).toContain(c.reports);
  });

  test('deletion takes the backups with it', () => {
    expect(s).toContain(c.deletion);
  });

  test('no em-dashes', () => {
    expect(s).not.toContain('—');
  });
});
