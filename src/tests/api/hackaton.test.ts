import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de cloudflare:workers env (patrón del repo).
vi.mock('cloudflare:workers', () => ({ env: { CLOUD_API_URL: 'https://api.test' } }));

import { isAdminPath, backendURL } from '../../lib/hackaton';

describe('hackaton proxy lib', () => {
  it('bloquea paths admin', () => {
    expect(isAdminPath('admin')).toBe(true);
    expect(isAdminPath('admin/state')).toBe(true);
    expect(isAdminPath('event')).toBe(false);
    expect(isAdminPath('register')).toBe(false);
  });
  it('construye la URL del backend con query', () => {
    expect(backendURL('event', '?x=1')).toBe('https://api.test/api/hackaton/event?x=1');
    expect(backendURL('/register', '')).toBe('https://api.test/api/hackaton/register');
  });
});
