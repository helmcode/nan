import { describe, it, expect, vi } from 'vitest';

// EVENTS_API_URL tiene prioridad sobre CLOUD_API_URL para /api/events.
vi.mock('cloudflare:workers', () => ({
  env: { CLOUD_API_URL: 'https://api.test', EVENTS_API_URL: 'https://events.test/' },
}));

import { backendURL } from '../../lib/events';

describe('events backend base', () => {
  it('usa EVENTS_API_URL cuando está definida (sin barra final duplicada)', () => {
    expect(backendURL('gauntlet-2026-08', '')).toBe('https://events.test/api/events/gauntlet-2026-08');
    expect(backendURL('gauntlet-2026-08/vote', '?x=1')).toBe('https://events.test/api/events/gauntlet-2026-08/vote?x=1');
  });
});
