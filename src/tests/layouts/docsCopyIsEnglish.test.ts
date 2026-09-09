import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Las docs son solo en inglés, y el español se había colado en lo que ve un lector.
 *
 * No en la prosa, que está escrita en inglés, sino en el CHROME: el botón de
 * copiar decía "Copiar", el toast "¡Copiado al portapapeles!", la tarjeta de
 * rate limits "Paralelo máximo / concurrentes", y un `<LimitationsCard>` sin
 * título explícito caía en "limitaciones conocidas". Nada de eso lo cazó la
 * revisión porque el código y el contenido de alrededor estaban en inglés; los
 * strings eran defaults y etiquetas enterrados en componentes.
 *
 * El español que queda legítimamente está fuera de alcance aquí: los
 * comentarios, que ningún lector ve, y la rama `es` de DocsTopBar, que es el
 * chrome traducido de /es/docs/api.
 */

const here = dirname(fileURLToPath(import.meta.url));
const componentsDir = resolve(here, '../../components/docs');

/** Palabras que solo aparecen en español, y nunca dentro de una URL o un identificador. */
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
 * Solo strings que un lector puede acabar viendo: literales entre comillas y
 * texto entre etiquetas. Los comentarios se excluyen a propósito, porque el
 * repo mantiene comentarios en español en los layouts y estilos adrede.
 */
function visibleText(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

/**
 * Ficheros que legítimamente llevan copy en español para las rutas /es, en una
 * rama `es` junto a la `en`. Su español es el objetivo, no una fuga.
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
      // Estos llevan a propósito el chrome y los metadatos traducidos de
      // /es/docs/api, en una rama `es` junto a la `en`. Su español es el
      // objetivo, no una fuga.
      if (BILINGUAL.some((f) => label.endsWith(f))) return;
      const found = SPANISH.filter((w) => text.includes(w));
      expect(found, `${label}: ${found.join(', ')}`).toEqual([]);
    });
  }
});

/**
 * El título por defecto de la tarjeta vive en dos sitios que tienen que
 * coincidir: el componente que lee una persona y el extractor que alimenta
 * /api/docs. Ya se desalinearon una vez con los rate limits, y por eso existe rateLimits.ts.
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
