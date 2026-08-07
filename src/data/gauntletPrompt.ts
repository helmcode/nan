/**
 * El prompt original del Gauntlet, el del experimento que dio pie al challenge.
 *
 * Vive aquí y NO en los diccionarios de i18n por dos razones: no se traduce
 * —lo que se copia es el original, en inglés, tal cual se escribió— y tenerlo
 * en un solo sitio evita que la versión que se lee y la que se copia acaben
 * diciendo cosas distintas. La página pinta los trozos marcados y el botón
 * copia `promptText()`: las dos salidas nacen de esta misma lista.
 */

/** Los subrayados de color. Cada uno tiene su nota al margen, menos `stack`. */
export type PromptInk = 'ref' | 'fanout' | 'loop' | 'critic' | 'harsh' | 'stack' | 'ultra';

export type PromptPiece = { t: string; ink?: PromptInk };

export const GAUNTLET_PROMPT: PromptPiece[][] = [
  [
    { t: 'I want you to build a first-person shooter at the level of the most recent ' },
    { t: 'Call of Duty games', ink: 'ref' },
    {
      t: '. It should be utterly perfect, visually beautiful, with every single thing done at AAA quality—from textures to physics to anything you could think of.',
    },
  ],
  [
    { t: 'Fan out sub-agents and have sub-agents tackle each one individually', ink: 'fanout' },
    { t: ' so that the game is utterly perfect. You should ' },
    { t: '/loop', ink: 'loop' },
    { t: ' on each item and have a ' },
    { t: 'separate sub-agent check it visually to ensure it', ink: 'critic' },
    { t: ' looks triple A. That separate sub-agent should be a really ' },
    { t: 'harsh critic', ink: 'harsh' },
    { t: ", and if it doesn't look triple A, it should keep going." },
  ],
  [
    {
      t: "Don't stop until each sub-agent is utterly wowed with the quality when compared with the actual Call of Duty game. It should literally compare them side by side blind and say which one looks better. Do this in ",
    },
    { t: 'ThreeJS', ink: 'stack' },
    { t: '. ' },
    { t: "/loop until it's utterly perfect. Fan out sub-agents and ultracode.", ink: 'ultra' },
  ],
];

/** El prompt en plano, que es lo que acaba en el portapapeles. */
export const promptText = (paragraphs: PromptPiece[][] = GAUNTLET_PROMPT) =>
  paragraphs.map((p) => p.map((piece) => piece.t).join('')).join('\n\n');
