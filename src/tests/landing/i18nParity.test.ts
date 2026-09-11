import { describe, expect, test } from 'vitest';
import en from '../../../i18n/en.json';
import es from '../../../i18n/es.json';

/**
 * Los dos diccionarios tienen que tener exactamente la misma forma.
 *
 * `useT` devuelve el subárbol `nan` tipado a partir de en.json, así que una
 * clave que solo exista en inglés compila igual y sale `undefined` en pantalla
 * —un hueco vacío, sin error—, y una lista con un elemento de menos deja media
 * sección sin pintar. El copy diverge en silencio: aquí se caza.
 */

type Node = unknown;

function shapeDiffs(a: Node, b: Node, path: string, out: string[]): void {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return void out.push(`${path}: uno es lista y el otro no`);
    if (a.length !== b.length) return void out.push(`${path}: ${a.length} elementos en en, ${b.length} en es`);
    a.forEach((item, i) => shapeDiffs(item, b[i], `${path}[${i}]`, out));
    return;
  }

  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object') return void out.push(`${path}: uno es objeto y el otro no`);
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    for (const key of Object.keys(objA)) {
      if (key in objB) shapeDiffs(objA[key], objB[key], `${path}.${key}`, out);
      else out.push(`${path}.${key}: falta en es`);
    }
    for (const key of Object.keys(objB)) if (!(key in objA)) out.push(`${path}.${key}: falta en en`);
    return;
  }

  if (typeof a !== typeof b) out.push(`${path}: ${typeof a} en en, ${typeof b} en es`);
}

/** Todas las cadenas del árbol, con su ruta. */
function strings(node: Node, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof node === 'string') out.push([path, node]);
  else if (Array.isArray(node)) node.forEach((item, i) => strings(item, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      strings(value, `${path}.${key}`, out);
    }
  }
  return out;
}

describe('paridad de los diccionarios', () => {
  test('en.json y es.json tienen la misma forma bajo `nan`', () => {
    const diffs: string[] = [];
    shapeDiffs(en.nan, es.nan, 'nan', diffs);
    expect(diffs).toEqual([]);
  });

  // Root-level subtrees (community, events) are consumed directly by
  // t('community.*', lang) / t('events.*', lang) — a key that exists only
  // in en renders the raw key path in /es. Parity must cover them too.
  test.each(['community', 'events'])('en.%s y es.%s tienen la misma forma', (key) => {
    const enSub = (en as Record<string, unknown>)[key];
    const esSub = (es as Record<string, unknown>)[key];
    const diffs: string[] = [];
    shapeDiffs(enSub, esSub, key, diffs);
    expect(diffs).toEqual([]);
  });

  test('ninguna cadena está vacía', () => {
    for (const [dict, name] of [
      [en.nan, 'en'],
      [es.nan, 'es'],
    ] as const) {
      for (const [path, value] of strings(dict, 'nan')) {
        expect(value.trim(), `${name}: ${path}`).not.toBe('');
      }
    }
  });
});
