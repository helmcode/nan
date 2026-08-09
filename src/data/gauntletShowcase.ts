/**
 * Los ejemplos de la sección 01 del Gauntlet Challenge.
 *
 * Son OBRA DE TERCEROS. Ninguno es de NaN, así que cada tarjeta enlaza a la
 * publicación original y enseña el handle de quien la firma: la miniatura es
 * el fotograma de portada del vídeo, servido desde /img/gauntlet para que
 * mirar la página no dispare una sola petición a X.
 *
 * Aquí solo vive lo que no se traduce (enlace, imagen, autor, fecha). El
 * título y la descripción están en i18n, emparejados por `id`, porque son lo
 * único que cambia de idioma a idioma.
 *
 * `credits` marca la única publicación que nombra el Gauntlet Loop de forma
 * explícita. Las demás no lo hacen, y por eso la sección se titula por lo que
 * está saliendo y no por la técnica: decir que las cinco salen del bucle sería
 * afirmar algo que sus autores no dicen.
 */
export interface ShowcaseShot {
  /** Empareja con la entrada del mismo `id` en `gauntlet.showcase.items`. */
  id: string;
  /** Handle de X sin arroba, tal y como lo escribe su dueño. */
  author: string;
  /** La publicación original. Es el único destino de la tarjeta. */
  href: string;
  /** Fotograma de portada, 640x360, copiado a /public en el repo. */
  img: string;
  /** Fecha de publicación, ya formateada: es la misma en los dos idiomas. */
  date: string;
  /** Cierto solo si el autor nombra el Gauntlet Loop en su publicación. */
  credits?: true;
}

/**
 * El primero es el destacado y ocupa el ancho entero: es el único que cita el
 * bucle por su nombre, y además es un remake de Call of Duty, que es justo lo
 * que cuenta la sección siguiente.
 */
export const GAUNTLET_SHOWCASE: readonly ShowcaseShot[] = [
  {
    id: 'claudefare',
    author: '0xRishi',
    href: 'https://x.com/0xRishi/status/2084322235788226653',
    img: '/img/gauntlet/modern-claudefare.webp',
    date: '3 ago 2026',
    credits: true,
  },
  {
    id: 'original',
    author: 'mattshumer_',
    href: 'https://x.com/mattshumer_/status/2081054356405731740',
    img: '/img/gauntlet/shooter-original.webp',
    date: '25 jul 2026',
  },
  {
    id: 'museum',
    author: 'chetaslua',
    href: 'https://x.com/chetaslua/status/2085982035072713012',
    img: '/img/gauntlet/neural-museum.webp',
    date: '8 ago 2026',
  },
  {
    id: 'anatomy',
    author: 'thebuggeddev',
    href: 'https://x.com/thebuggeddev/status/2083884856531177942',
    img: '/img/gauntlet/anatomy-atelier.webp',
    date: '2 ago 2026',
  },
  {
    id: 'ironveil',
    author: 'ChrisGPT',
    href: 'https://x.com/ChrisGPT/status/2085889688397570315',
    img: '/img/gauntlet/ironveil-range.webp',
    date: '8 ago 2026',
  },
];
