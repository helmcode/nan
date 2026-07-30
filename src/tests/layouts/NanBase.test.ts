import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Sucede a Base.animation.test.ts, que vigilaba la landing anterior.
 *
 * El fallo que aquel test perseguía sigue siendo posible aquí, y de hecho es
 * MÁS fácil de cometer: el fondo animado se perdió una vez porque index.astro
 * pasaba el componente como children y el layout no tenía <slot />. Astro
 * descarta los children huérfanos sin error, así que no saltó en CI y nadie lo
 * vio en semanas.
 *
 * NanPage usa slots CON NOMBRE (head, nav, footer). Si alguien renombra uno en
 * un lado y no en el otro, la nav o el footer desaparecen en silencio,
 * exactamente igual. De ahí los guards de abajo.
 *
 * Se comprueba el código fuente y no el HTML renderizado porque montar estas
 * páginas en SSR arrastra el árbol entero y los bindings de Cloudflare.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), 'utf-8');

const nanBase = read('../../layouts/NanBase.astro');
const nanPage = read('../../layouts/NanPage.astro');
const index = read('../../pages/_home.astro');

describe('NanBase — fondo de partículas', () => {
  it('monta el canvas del fondo dentro del <body>', () => {
    const body = nanBase.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    expect(body, 'NanBase.astro debe tener <body>').not.toBeNull();
    expect(body![1]).toContain('id="bg-fx"');
  });

  it('la home arranca las partículas', () => {
    expect(index).toContain('initParticles');
  });

  it('las partículas son SOLO de la home', () => {
    // En el resto de páginas estorban a la lectura; si alguien las mueve al
    // layout compartido, vuelven a salir en todas.
    expect(nanPage).not.toContain('initParticles');
  });
});

describe('NanBase — slots que no se pueden perder en silencio', () => {
  for (const slot of ['head', 'nav', 'footer']) {
    it(`NanBase expone el slot "${slot}"`, () => {
      expect(nanBase).toMatch(new RegExp(`<slot\\s+name="${slot}"`));
    });

    it(`NanPage rellena o reenvía el slot "${slot}"`, () => {
      expect(nanPage).toMatch(new RegExp(`slot="${slot}"`));
    });
  }
});

describe('NanBase — accesibilidad y SEO que no deben desaparecer', () => {
  it('mantiene el skip link apuntando a <main id="main">', () => {
    expect(nanBase).toContain('class="skip-link" href="#main"');
    expect(nanBase).toContain('id="main"');
  });

  it('emite canonical y alternates hreflang', () => {
    expect(nanBase).toContain('rel="canonical"');
    expect(nanBase).toContain('hreflang');
    expect(nanBase).toContain('x-default');
  });

  // Solo la directiva, no el fichero entero: los dominios se nombran en el
  // comentario que explica por qué ya no están.
  const cspBlock = nanBase.slice(nanBase.indexOf('const csp = ['), nanBase.indexOf("].join('; ')"));

  it('la CSP permite data: en img-src (el ruido del disquete lo necesita)', () => {
    expect(cspBlock).toContain("img-src 'self' data:");
  });

  it('la CSP ya no abre la puerta a Google Fonts', () => {
    expect(cspBlock).not.toContain('fonts.googleapis.com');
    expect(cspBlock).not.toContain('fonts.gstatic.com');
    expect(cspBlock).toContain("font-src 'self'");
  });
});

describe('landing — la sección Agents no vuelve', () => {
  it('no se importa ni se renderiza Agents', () => {
    expect(index).not.toMatch(/import\s+Agents\s+from/);
    expect(index).not.toContain('<Agents');
  });
});
