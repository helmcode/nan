import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Workspace backup add-on (helmcode/nan#130): the terms are the contract the
 * UI copy points at. These tests pin the promises that must never drift:
 * no backups without the add-on, daily crash-consistent snapshots, 7-day
 * retention, deletion on disable/workspace deletion, snapshots kept until the
 * workspace is deleted when a slot or benefit ends, and no partial refund.
 */
const here = dirname(fileURLToPath(import.meta.url));
const pages = resolve(here, '../../pages');
const flat = (p: string) => readFileSync(resolve(pages, p), 'utf-8').replace(/\s+/g, ' ');

function section(src: string): string {
  const m = src.match(/<p id="workspace-backups">(.*?)<\/p>/);
  expect(m, 'workspace-backups paragraph present').toBeTruthy();
  return m![1].replace(/<[^>]+>/g, '');
}

describe('terms: workspace backups (EN)', () => {
  const src = flat('terms.astro');
  const p = section(src);

  test('sits under "Membership and payments"', () => {
    const h = src.indexOf('<h2>Membership and payments</h2>');
    const next = src.indexOf('<h2>', h + 1);
    const at = src.indexOf('id="workspace-backups"');
    expect(h).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(h);
    expect(at).toBeLessThan(next);
  });

  test('states every promise', () => {
    expect(p).toContain('no backups unless the workspace backup add-on is active');
    expect(p).toContain('once a day and kept for 7 days');
    expect(p).toContain('crash-consistent');
    expect(p).toContain('power');
    expect(p).toContain('no refund for the current month');
    expect(p).toContain('Turning the add-on off or deleting the workspace deletes all its snapshots permanently');
    expect(p).toContain('the add-on stops being billed');
    expect(p).toContain('including any access you configured yourself');
    expect(p).toContain('only your current NaN SSH key is re-applied');
  });

  test('restore limits and grace rules (product decision 2026-10-02)', () => {
    expect(p).toContain('You can restore up to 3 times per workspace in any 24 hours');
    expect(p).toContain('there are no on-demand backups');
    expect(p).toContain('Snapshots can only be restored while the add-on is active');
    expect(p).toContain('attach the workspace to an active slot (or renew the membership, for a free workspace) and turn the add-on on again, which is billed again');
    expect(p).toContain('When billing ends, no new snapshots are taken and existing snapshots are kept until the workspace is deleted');
    expect(p).toContain('within 14 days');
  });

  test('never promises deletion at slot end (owner rule 2026-10-02)', () => {
    const clause = p.slice(p.indexOf('When billing ends')).split('.')[0];
    expect(clause).toContain('no new snapshots are taken');
    expect(clause).toContain('existing snapshots are kept until the workspace is deleted');
    expect(clause).not.toMatch(/snapshots are deleted|deletes all/);
  });
});

describe('terms: workspace backups (ES)', () => {
  const src = flat('es/terms.astro');
  const p = section(src);

  test('sits under "Membresía y pagos"', () => {
    const h = src.indexOf('<h2>Membresía y pagos</h2>');
    const next = src.indexOf('<h2>', h + 1);
    const at = src.indexOf('id="workspace-backups"');
    expect(h).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(h);
    expect(at).toBeLessThan(next);
  });

  test('states every promise', () => {
    expect(p).toContain('no tienen copias de seguridad salvo que el complemento de backups esté activo');
    expect(p).toContain('una vez al día y se conserva durante 7 días');
    expect(p).toContain('crash-consistent');
    expect(p).toContain('sin reembolso del mes en curso');
    expect(p).toContain('Desactivar el complemento o eliminar el workspace borra todas sus instantáneas de forma permanente');
    expect(p).toContain('el complemento deja de cobrarse');
    expect(p).toContain('incluido cualquier acceso que hayas configurado tú');
    expect(p).toContain('solo vuelve a aplicar tu clave SSH actual de NaN');
  });

  test('límites de restauración y reglas de gracia', () => {
    expect(p).toContain('Puedes restaurar hasta 3 veces por workspace en cualquier periodo de 24 horas');
    expect(p).toContain('no hay copias bajo demanda');
    expect(p).toContain('Las instantáneas solo se pueden restaurar mientras el complemento esté activo');
    expect(p).toContain('volver a activar el complemento, que se cobra de nuevo');
    expect(p).toContain('Cuando termina la facturación, no se toman nuevas instantáneas y las existentes se conservan hasta que se elimine el workspace');
    expect(p).toContain('en un plazo de 14 días');
  });
});
