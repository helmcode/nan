import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('cloudflare:workers', () => ({ env: { CLOUD_API_URL: 'https://api.test' } }));

import {
  actorLabel, auditSearch, backupDate, fmtBytes, handleAuditForm, readAuditFilters,
  AUDIT_DEFAULT_LIMIT, AUDIT_MAX_LIMIT,
} from '../../lib/eventsAdminAudit';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const PAGE = 'https://nan.builders/events/admin/demo/auditoria';

function post(fields: Record<string, string>): Request {
  return new Request(PAGE, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://nan.builders' },
    body: new URLSearchParams(fields).toString(),
  });
}

function lastCall(spy: ReturnType<typeof vi.spyOn>) {
  const [url, init] = spy.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

afterEach(() => vi.restoreAllMocks());

describe('filtros de auditoría (W-09)', () => {
  it('sin parámetros: sin since ni action y el límite por defecto del backend', () => {
    const f = readAuditFilters(new URL(PAGE));
    expect(f).toEqual({ since: '', action: '', limit: AUDIT_DEFAULT_LIMIT });
    expect(auditSearch(f)).toBe(`?limit=${AUDIT_DEFAULT_LIMIT}`);
  });

  it('desde acepta datetime-local (UTC) y fecha suelta; acción y límite se acotan', () => {
    const f = readAuditFilters(new URL(`${PAGE}?desde=2026-09-05T10:30&accion=state.&limite=5000`));
    expect(f).toEqual({ since: '2026-09-05T10:30:00.000Z', action: 'state.', limit: AUDIT_MAX_LIMIT });
    expect(auditSearch(f)).toBe(`?since=2026-09-05T10%3A30%3A00.000Z&action=state.&limit=${AUDIT_MAX_LIMIT}`);
    expect(readAuditFilters(new URL(`${PAGE}?desde=2026-09-05`)).since).toBe('2026-09-05T00:00:00.000Z');
  });

  it('lo que no vale se ignora en vez de provocar un 400', () => {
    const f = readAuditFilters(new URL(`${PAGE}?desde=ayer&accion=DROP%20TABLE&limite=-3`));
    expect(f).toEqual({ since: '', action: '', limit: AUDIT_DEFAULT_LIMIT });
  });
});

describe('textos auxiliares', () => {
  it('actor, tamaño y fecha del backup', () => {
    expect(actorLabel(null)).toBe('sistema');
    expect(actorLabel({ kind: 'staff', email: 'a@nan.builders', user_uuid: 'u1' })).toBe('a@nan.builders');
    expect(actorLabel({ kind: 'admin_key', label: 'saul-curl' })).toBe('saul-curl (clave de admin)');
    expect(actorLabel({ kind: 'admin_key' })).toBe('clave de admin');
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(1616)).toBe('1.6 KB');
    expect(fmtBytes(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(backupDate('20260905T100000Z-2')).toBe('2026-09-05T10:00:00Z');
    expect(backupDate('raro')).toBe('');
  });
});

describe('handleAuditForm (W-09)', () => {
  it('ignora el GET y rechaza otro origen', async () => {
    expect(await handleAuditForm(new Request(PAGE), 'c', 'demo')).toEqual({});
    const foreign = new Request(PAGE, { method: 'POST', headers: { origin: 'https://evil.test', 'content-type': 'application/x-www-form-urlencoded' }, body: 'action=restore' });
    expect(await handleAuditForm(foreign, 'c', 'demo')).toEqual({ forbidden: true });
  });

  it('acción desconocida o backup sin indicar: no llama al backend', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const unknown = await handleAuditForm(post({ action: 'delete' }), 'c', 'demo');
    expect(unknown.result?.fields).toEqual(['action']);
    const missing = await handleAuditForm(post({ action: 'restore', file: 'event.json' }), 'c', 'demo');
    expect(missing.result?.ok).toBe(false);
    expect(missing.result?.fields).toEqual(['timestamp']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('previsualizar: POST …/backups/restore con dry_run y se queda en la página', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ ok: true, data: { file: 'participants.json', timestamp: '20260905T100000Z' }, warnings: [], dry_run: true }));
    const out = await handleAuditForm(post({ action: 'restore_preview', file: 'participants.json', timestamp: '20260905T100000Z' }), 'c', 'demo');
    expect(out.redirect).toBeUndefined();
    expect(out.action).toBe('restore_preview');
    expect(out.result?.ok).toBe(true);
    const { url, init, body } = lastCall(spy);
    expect(url).toBe('https://api.test/api/events/demo/admin/backups/restore');
    expect(init.method).toBe('POST');
    expect(body).toEqual({ file: 'participants.json', timestamp: '20260905T100000Z', dry_run: true });
  });

  it('restaurar de verdad redirige con el flash y los avisos', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ ok: true, data: { file: 'event.json', timestamp: '20260905T100000Z', previous_backup: '20260906T120000Z' }, warnings: ['automation_dates_missing'] }));
    const out = await handleAuditForm(post({ action: 'restore', file: 'event.json', timestamp: '20260905T100000Z' }), 'c', 'demo');
    expect(out.redirect).toBe('/events/admin/demo/auditoria?ok=restaurado&warn=automation_dates_missing');
    expect(lastCall(spy).body).toEqual({ file: 'event.json', timestamp: '20260905T100000Z', dry_run: false });
  });

  it('un backup que no valida (409) se queda en la página sin redirigir', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ ok: false, error: 'backup_invalid', message: 'el backup no valida' }, 409));
    const out = await handleAuditForm(post({ action: 'restore', file: 'event.json', timestamp: 'x' }), 'c', 'demo');
    expect(out.redirect).toBeUndefined();
    expect(out.result?.error).toBe('backup_invalid');
  });
});
