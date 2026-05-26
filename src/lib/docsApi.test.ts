import { describe, expect, it } from 'vitest';
import { DOCS_CACHE_CONTROL, SAFE_SLUG, ifNoneMatchMatches } from './docsApi';

describe('SAFE_SLUG', () => {
  it('accepts safe slugs and rejects unsafe ones', () => {
    const cases: Array<[string, boolean]> = [
      ['api', true],
      ['getting-started', true],
      ['a', true],
      ['a0', true],
      ['0-bad', true],
      ['a'.repeat(64), true],
      ['-bad', false],
      ['Bad', false],
      ['', false],
      ['../etc', false],
      ['api/', false],
      ['a'.repeat(65), false],
    ];
    for (const [slug, expected] of cases) {
      expect(SAFE_SLUG.test(slug), slug).toBe(expected);
    }
  });
});

describe('DOCS_CACHE_CONTROL', () => {
  it('is set to 900s for both browser and shared caches', () => {
    expect(DOCS_CACHE_CONTROL).toBe('public, max-age=900, s-maxage=900');
  });
});

describe('ifNoneMatchMatches', () => {
  const etag = '"sha256:abc"';

  it('returns false for missing header', () => {
    expect(ifNoneMatchMatches(null, etag)).toBe(false);
  });

  it('returns true for wildcard', () => {
    expect(ifNoneMatchMatches('*', etag)).toBe(true);
  });

  it('matches exact value', () => {
    expect(ifNoneMatchMatches(etag, etag)).toBe(true);
  });

  it('matches against a comma-separated list', () => {
    expect(ifNoneMatchMatches(`"other", ${etag}, "x"`, etag)).toBe(true);
  });

  it('ignores W/ weak prefix on header and etag', () => {
    expect(ifNoneMatchMatches(`W/${etag}`, etag)).toBe(true);
    expect(ifNoneMatchMatches(etag, `W/${etag}`)).toBe(true);
  });

  it('does not match unrelated tags', () => {
    expect(ifNoneMatchMatches('"sha256:other"', etag)).toBe(false);
  });
});
