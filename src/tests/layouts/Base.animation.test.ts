import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Regression guard for the meteor / streak background on the landing.
//
// The AnimatedBackground component (.dot-grid, 3 orbs, 8 streaks) was
// silently dropped once because index.astro passed it as children into
// Base.astro but the layout had no <slot />. Astro discards orphan
// children without an error, so nothing surfaced in CI until a user
// noticed the animation was gone weeks later.
//
// The fix moved the component into Base.astro itself. This test pins
// that fix: if anyone removes the import or the <AnimatedBackground />
// usage from the layout, the test fails and the deploy workflow stops
// before reaching wrangler deploy.
//
// We assert on the layout source rather than the rendered HTML because
// SSR-rendering Base.astro pulls in the full landing tree (Hero, KV
// bindings, etc.), which is too heavy for a unit test. The source-level
// check is enough to catch the regression class — losing the import or
// the JSX usage are the only ways the bug can reappear.

const here = dirname(fileURLToPath(import.meta.url));
const baseLayoutPath = resolve(here, '../../layouts/Base.astro');
const componentPath = resolve(here, '../../components/landing/AnimatedBackground.astro');

describe('Base layout — animated background guard', () => {
  const baseSource = readFileSync(baseLayoutPath, 'utf-8');
  const componentSource = readFileSync(componentPath, 'utf-8');

  it('imports AnimatedBackground from the landing components', () => {
    expect(baseSource).toMatch(
      /import\s+AnimatedBackground\s+from\s+['"][^'"]*components\/landing\/AnimatedBackground\.astro['"]/,
    );
  });

  it('mounts <AnimatedBackground /> inside the <body>', () => {
    const bodyMatch = baseSource.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    expect(bodyMatch, 'Base.astro must have a <body> tag').not.toBeNull();
    expect(bodyMatch![1]).toContain('<AnimatedBackground');
  });

  it('AnimatedBackground component still exposes the dot grid, 3 orbs, 8 streaks and streak-diagonal keyframes', () => {
    expect(componentSource).toContain('dot-grid');
    expect(componentSource).toContain('streak-diagonal');
    for (let i = 1; i <= 3; i++) {
      expect(componentSource).toMatch(new RegExp(`\\borb-${i}\\b`));
    }
    for (let i = 1; i <= 8; i++) {
      expect(componentSource).toMatch(new RegExp(`\\bstreak-${i}\\b`));
    }
  });
});
