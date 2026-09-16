import { describe, expect, test } from 'vitest';
import { h } from 'preact';
import { render } from 'preact-render-to-string';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import RegisterForm, { type FormStrings } from '../../components/events/RegisterForm';
import SubmissionForm from '../../components/events/SubmissionForm';

/**
 * Guardas sobre la UI de eventos: patrones que ya se rompieron una vez.
 *
 * Aquí NO hay barrido de texto sobre las listas que pueden llegar `null`
 * (`registration.specialties`, `registration.levels`, `submission.checks`,
 * `submission.prize_requires`). Lo hubo, y era peor que lo que tenemos ahora:
 * un regex sobre `ev.<campo>` no ve una desestructuración (`const { checks } =
 * ev.submission`), que es el refactor más natural en un `.astro`, y sí protesta
 * por código correcto (`ev.submission.checks?.map(...)`). Esos cuatro campos
 * están tipados `string[] | null` en `src/lib/events.ts`, así que quien exige
 * el `?? []` es `astro check` — que sí typechequea el frontmatter de los
 * `.astro`, incluidas las lecturas que ningún regex alcanza. `npm run check`
 * forma parte de la verificación del repo.
 *
 * (`submission.fields` no está en esa lista: en el backend es un struct por
 * valor y `encoding/json` lo serializa siempre como objeto.)
 *
 * `preact-render-to-string` está en devDependencies. Entraba antes de rebote
 * con `@astrojs/preact` y funcionaba por el izado de npm, que es un detalle del
 * gestor de paquetes y no un contrato.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../..');

/**
 * En v3 el vocabulario de especialidades y niveles lo escribe quien organiza el
 * evento (SPEC §3.2) y `events.options` solo traduce el fijo de v2, así que sus
 * etiquetas pasan por `optionLabel` (ver `704c9a8`): si no, "devops" salía en
 * minúscula al lado de "Frontend" en la misma lista.
 *
 * Los checks de la entrega son la excepción: ese vocabulario lo fija el backend,
 * siempre está en el diccionario, y una mayúscula forzada sobre una clave suelta
 * ("Has_repo") sería peor que la clave.
 */
describe('etiquetas del vocabulario libre', () => {
  // Un valor que el diccionario conoce y otro que no: la diferencia entre pasar
  // por `optionLabel` y no hacerlo solo se ve en el segundo.
  const options = { frontend: 'Frontend', in_nan_space: 'En el espacio NaN' };
  const fields = {
    description: 'optional' as const, repo_url: 'optional' as const,
    space_url: 'optional' as const, image_url: 'optional' as const,
    video_url: 'optional' as const,
  };

  test('el alta pinta en mayúscula la especialidad que no está en el diccionario', () => {
    const html = render(h(RegisterForm, {
      slug: 'taller', t: {} as FormStrings, meHref: '/events/taller/me',
      discordMode: 'none' as const,
      specialties: ['frontend', 'devops'], levels: ['junior'], options,
    }));
    expect(html).toContain('>Frontend<');
    expect(html).toContain('>Devops<');
    expect(html).toContain('>Junior<');
    expect(html).not.toContain('>devops<');
  });

  test('la entrega pinta las suyas igual', () => {
    const html = render(h(SubmissionForm, {
      slug: 'taller', t: {}, existing: null, fields,
      // `solo` sin ficha de participante es lo que despliega estos selects.
      format: 'solo' as const, hasParticipant: false,
      checks: [], autoMax: 0, discordMode: 'none' as const,
      specialties: ['frontend', 'devops'], levels: ['junior', 'staff'], options,
    }));
    expect(html).toContain('>Frontend<');
    expect(html).toContain('>Devops<');
    expect(html).not.toContain('>devops<');
    // Los niveles usan el mismo helper: se comprueban aquí también para que la
    // pareja especialidad/nivel no quede cubierta a medias en este formulario.
    expect(html).toContain('>Junior<');
    expect(html).toContain('>Staff<');
  });

  test('los checks de la entrega salen del diccionario, sin mayúscula forzada', () => {
    const html = render(h(SubmissionForm, {
      slug: 'taller', t: {},
      // Con entrega existente el formulario pinta el resumen de checks.
      existing: { auto_points: 1, checks: { in_nan_space: { pass: true }, has_repo: { pass: false } } },
      fields,
      format: 'solo' as const, hasParticipant: true,
      checks: ['in_nan_space', 'has_repo'], autoMax: 2, discordMode: 'none' as const,
      specialties: [], levels: [], options,
    }));
    expect(html).toContain('En el espacio NaN');
    // La clave que el diccionario no tiene sale tal cual: `optionLabel` la
    // habría convertido en "Has_repo".
    expect(html).toContain('has_repo');
    expect(html).not.toContain('Has_repo');
  });
});

/**
 * `_me.astro` no se puede renderizar aquí (necesita el compilador de Astro), así
 * que sobre él queda una guarda de texto. Es sobre la AUSENCIA del antipatrón, no
 * sobre la presencia de una forma concreta de escribirlo: exigir un
 * `label(x.specialty)` literal rompía al renombrar el helper o al escribir
 * `label(x.specialty ?? '')`, sin que nada estuviera mal.
 */
describe('_me.astro', () => {
  const source = readFileSync(resolve(src, 'pages/events/[slug]/_me.astro'), 'utf-8');
  // El frontmatter (donde `optionLabel` se importa y se envuelve) no cuenta:
  // lo que se vigila es lo que se imprime en la plantilla.
  const template = source.split(/^---$/m).slice(2).join('---');

  test('no imprime especialidad ni nivel sin pasarlos por el helper', () => {
    // Cada aparición de `.specialty`/`.level` en la plantilla vale solo si:
    //   - va envuelta en `label(...)`  → se imprime traducida, o
    //   - es una condición (`x.specialty || …`, `(… || x.level) && …`) → se
    //     consulta para decidir si se pinta la línea, que sí está permitido.
    // Cualquier otra cosa la imprime en crudo. Esto caza `{p.specialty}`, y
    // también `{p.specialty ?? '—'}` y `{[p.specialty, p.level].join(' · ')}`,
    // que son la forma en la que el bug reaparecería y que el barrido anterior
    // no veía (le bastaba con encontrar una llamada, aunque fuera `.join(`).
    const occurrences = [...template.matchAll(/\.(?:specialty|level)\b/g)];
    expect(occurrences.length).toBeGreaterThan(0); // si no, no vigila nada
    const raw = occurrences.filter((m) => {
      const antes = template.slice(0, m.index);
      const despues = template.slice(m.index + m[0].length);
      const envuelto = /\blabel\(\s*[\w.?![\]'"]*$/.test(antes);
      const condicion = /^\s*(?:\|\||&&)/.test(despues) || /^\s*\)\s*&&/.test(despues);
      return !envuelto && !condicion;
    });
    expect(raw.map((m) => template.slice(Math.max(0, m.index - 30), m.index + 20))).toEqual([]);
  });

  test('el helper que envuelve es optionLabel', () => {
    expect(source).toMatch(/optionLabel\(/);
  });
});

describe('event cover (B-27)', () => {
  const page = readFileSync(resolve(src, 'pages/events/[slug]/_index.astro'), 'utf-8');
  const base = readFileSync(resolve(src, 'layouts/NanBase.astro'), 'utf-8');

  test('the page renders the cover only through the scheme guard', () => {
    expect(page).toMatch(/const cover = import\.meta\.env\.DEV \? safeUrl\(ev\.image_url\) : safeImage\(ev\.image_url\)/);
    expect(page).toMatch(/\{cover && \(\s*<img src=\{cover\} alt=""/);
    expect(page).toContain('image={cover || undefined}');
    // Nothing else prints the raw field.
    expect(page.match(/ev\.image_url/g)).toHaveLength(2);
  });

  test('the layout only sends the 1200x630 hints with the generic card', () => {
    expect(base).toContain('{ogImageGeneric && <meta property="og:image:width" content="1200" />}');
    expect(base).toContain('{ogImageGeneric && <meta property="og:image:height" content="630" />}');
    expect(base).toContain('const ogImageGeneric = !image;');
  });
});
