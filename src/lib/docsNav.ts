/**
 * Lógica de navegación e índice de búsqueda del shell de docs.
 *
 * Vive aquí y no inline en Docs.astro para poder probarla con tests unitarios:
 * a un layout solo se llega con un render SSR completo, y estas son justo las
 * partes que se rompen en silencio. La navegación es lo que usa quien lee para
 * encontrar cualquier cosa, y los anchors de abajo son un contrato con un
 * paquete de terceros.
 */

export interface DocsNavItem {
  slug: string;
  label: string;
  order: number;
  group: string;
  description: string;
}

export interface DocsNavGroup {
  group: string;
  items: DocsNavItem[];
}

/** Destino de un resultado de búsqueda: un encabezado dentro de una página de docs. */
export interface DocsHeading {
  text: string;
  /** Fragmento SIN la '#' inicial. */
  slug: string;
}

/**
 * Las reglas de slug de Scalar para un encabezado, reproducidas.
 *
 * Verificado contra la página renderizada: "Versioning & compatibility" pasa a
 * `versioning-compatibility` y "Making requests" a `making-requests`.
 */
export function slugifyAnchor(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Dónde vive un encabezado de la referencia de la API, como fragmento.
 *
 * Scalar tiene DOS espacios de nombres de anchors y no son intercambiables:
 * las secciones de la vista general (que salen de `info.description`) se
 * direccionan como `description/<slug>`, y los grupos de endpoints como
 * `tag/<slug>`. Mandar a un lector a `tag/authentication` lo deja en la página
 * sin hacer scroll, porque ese id no existe.
 *
 * Es un acoplamiento con `@scalar/api-reference` que nada más impone, así que
 * lo fijan los tests: si una versión de Scalar cambia el esquema, los
 * resultados de búsqueda empiezan a apuntar a ninguna parte y ningún build falla.
 */
export function apiSearchHeadings(spec: {
  info?: { description?: string };
  tags?: Array<{ name?: string }>;
}): DocsHeading[] {
  const overview = (spec.info?.description ?? '')
    .split('\n')
    // `^##\s` solo casa con el nivel 2: un `###` tiene una '#' donde debe ir el espacio.
    .flatMap((line) => {
      const m = /^##\s+(.+)$/.exec(line);
      return m ? [m[1].trim()] : [];
    })
    .map((text) => ({ text, slug: `description/${slugifyAnchor(text)}` }));

  const tags = (spec.tags ?? [])
    .map((t) => t.name)
    .filter((name): name is string => Boolean(name))
    .map((name) => ({ text: name, slug: `tag/${slugifyAnchor(name)}` }));

  return [...overview, ...tags];
}

/**
 * Si una entrada de navegación debe leerse como la página actual.
 *
 * Coincidencia por prefijo, no solo igualdad, para que una ruta anidada
 * resalte a su padre. `/docs` se excluye de la rama de prefijo o se
 * resaltaría en todas las páginas de la sección.
 */
export function isActiveDocPath(here: string, slug: string): boolean {
  const target = slug.replace(/\/+$/, '');
  const current = here.replace(/\/+$/, '') || '/docs';
  return current === target || (target !== '/docs' && current.startsWith(`${target}/`));
}

/**
 * Agrupa la navegación conservando el orden que los elementos ya traen.
 *
 * El orden de los grupos sigue el `order` más bajo de cada uno en vez de una
 * lista escrita a mano en el layout, para que añadir una guía siga siendo
 * cuestión de crear un fichero.
 */
export function groupDocsNav(items: DocsNavItem[]): DocsNavGroup[] {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const groups: DocsNavGroup[] = [];
  for (const item of sorted) {
    const existing = groups.find((g) => g.group === item.group);
    if (existing) existing.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return groups;
}
