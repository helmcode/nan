import { describe, expect, it } from 'vitest';
import { sha256Hex } from './contentHash';

describe('sha256Hex', () => {
  it('hashes the empty string deterministically', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('hashes ASCII text deterministically', async () => {
    expect(await sha256Hex('hello world')).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
  });

  it('hashes UTF-8 multibyte text deterministically', async () => {
    // "héllo wörld" with é=0xC3 0xA9 and ö=0xC3 0xB6
    expect(await sha256Hex('héllo wörld')).toBe(
      'a1003f7d04a4115711d0b48a2eaf1359ce565d2d2a6fd65098dfcffadeeef59f',
    );
  });
});
