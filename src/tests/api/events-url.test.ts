import { describe, it, expect, vi } from 'vitest';

// EVENTS_API_URL tiene prioridad sobre CLOUD_API_URL para /api/events.
vi.mock('cloudflare:workers', () => ({
  env: { CLOUD_API_URL: 'https://api.test', EVENTS_API_URL: 'https://events.test/' },
}));

import { env } from 'cloudflare:workers';
import { backendURL } from '../../lib/events';

describe('events backend base', () => {
  it('usa EVENTS_API_URL cuando está definida (sin barra final duplicada)', () => {
    expect(backendURL('gauntlet-2026-08', '')).toBe('https://events.test/api/events/gauntlet-2026-08');
    expect(backendURL('gauntlet-2026-08/vote', '?x=1')).toBe('https://events.test/api/events/gauntlet-2026-08/vote?x=1');
  });

  it('cae a CLOUD_API_URL cuando EVENTS_API_URL está vacía (var sin definir en wrangler)', () => {
    const e = env as unknown as Record<string, string>;
    const prev = e.EVENTS_API_URL;
    e.EVENTS_API_URL = '';
    try {
      expect(backendURL('gauntlet-2026-08', '')).toBe('https://api.test/api/events/gauntlet-2026-08');
    } finally {
      e.EVENTS_API_URL = prev;
    }
  });
});
