import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * The docs are English-only, and Spanish had leaked into what a reader sees.
 *
 * Not into the prose, which is written in English, but into the CHROME: the
 * copy button said "Copiar", the toast "¡Copiado al portapapeles!", the rate
 * limits card "Paralelo máximo / concurrentes", and a `<LimitationsCard>` with
 * no explicit title fell back to "limitaciones conocidas". None of it was
 * caught by review because the surrounding code and content were English; the
 * strings were defaults and labels buried in components.
 *
 * The Spanish that legitimately remains is out of scope here: comments, which
 * no reader sees, and the `es` branch of DocsTopBar, which is the translated
 * chrome of /es/docs/api.
 */

const here = dirname(fileURLToPath(import.meta.url));
const componentsDir = resolve(here, '../../components/docs');

/** Words that only appear in Spanish, and never inside a URL or identifier. */
const SPANISH = [
  'copiar',
  'copiado',
  'portapapeles',
  'limitaciones',
  'conocidas',
  'paralelo',
  'concurrentes',
  'por modelo',
  'por api key',
  'anterior',
  'siguiente',
  'en esta página',
  'búsqueda',
  'página',
];

/**
 * Only strings a reader can end up seeing: quoted literals and text between
 * tags. Comments are deliberately excluded, since the repo keeps Spanish ones
 * in the layouts and styles on purpose.
 */
function visibleText(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

/**
 * Files that legitimately hold Spanish copy for the /es routes, in an `es`
 * branch beside the `en` one. Their Spanish is the point, not a leak.
 */
const BILINGUAL = ['DocsTopBar.astro', 'ApiReference.astro', 'Docs.astro'];

const files = [
  ...readdirSync(componentsDir)
    .filter((f) => f.endsWith('.astro'))
    .map((f) => [`components/docs/${f}`, resolve(componentsDir, f)] as const),
  ['layouts/Docs.astro', resolve(here, '../../layouts/Docs.astro')] as const,
  ['lib/mdxToText.ts', resolve(here, '../../lib/mdxToText.ts')] as const,
];

describe('the docs chrome is in English', () => {
  for (const [label, path] of files) {
    it(`${label} shows no Spanish to the reader`, () => {
      const text = visibleText(readFileSync(path, 'utf-8')).toLowerCase();
      // These two carry the translated chrome and metadata of /es/docs/api on
      // purpose, in an `es` branch beside the `en` one. Their Spanish is the
      // point, not a leak.
      if (BILINGUAL.some((f) => label.endsWith(f))) return;
      const found = SPANISH.filter((w) => text.includes(w));
      expect(found, `${label}: ${found.join(', ')}`).toEqual([]);
    });
  }
});

/**
 * The card's default title lives in two places that have to agree: the
 * component a person reads and the extractor that feeds /api/docs. They drifted
 * once already over the rate limits, which is why rateLimits.ts exists.
 */
describe('LimitationsCard default title', () => {
  it('matches between the component and the text extractor', () => {
    const component = readFileSync(resolve(componentsDir, 'LimitationsCard.astro'), 'utf-8');
    const extractor = readFileSync(resolve(here, '../../lib/mdxToText.ts'), 'utf-8');
    const fromComponent = /title = '([^']+)'/.exec(component)?.[1];
    const fromExtractor = /getAttr\(node, 'title'\) \?\? '([^']+)'/.exec(extractor)?.[1];
    expect(fromComponent).toBeDefined();
    expect(fromExtractor).toBe(fromComponent);
  });
});
