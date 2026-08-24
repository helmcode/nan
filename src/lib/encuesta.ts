/**
 * Tipos del informe de la encuesta de comunidad (agosto de 2026).
 *
 * Los datos viven en `src/data/encuesta.json` con el mismo formato bilingüe que
 * `eventos.json`: cada texto es un par `{ en, es }` que se resuelve con `loc()`.
 *
 * Dos reglas del dataset que la página da por hechas y que guarda
 * `surveyData.test.ts`:
 *
 *  - **Solo porcentajes.** Ningún gráfico ni tabla lleva el recuento de
 *    respuestas. Con 78 respuestas, un recuento por opción invita a hacer
 *    aritmética sobre personas concretas, y el porcentaje dice lo mismo.
 *  - **Citas anónimas.** Sin nombre y sin número de respuesta, y fuera las que
 *    permitirían reconocer a alguien. Aquí no se publican proyectos,
 *    direcciones ni datos de contacto: el permiso que dio la comunidad era
 *    para Built with NaN, no para este informe.
 */

import raw from '../data/encuesta.json';
import { loc, type Localized } from './agenda';

/** `hi` destaca la barra dominante; `neg` la pinta en gris (rechazos). */
export type BarKind = 'hi' | 'neg';

export type Bar = {
  label: Localized;
  /** Porcentaje sobre la base de la pregunta. Es también el ancho de la barra. */
  pct: number;
  kind?: string;
};

export type SurveyTableRow = {
  label: Localized;
  cells: string[];
  /** Índice de la celda a destacar, si hay una que lleva el peso de la lectura. */
  highlight?: number;
};

export type SurveyTable = {
  caption: Localized;
  head: Localized[];
  rows: SurveyTableRow[];
};

export type Quote = {
  text: Localized;
  /** Solo cuando aporta (el huso horario de quien responde, el idioma original). */
  cite?: Localized;
};

export type Question = {
  /** `P01`, `P04-P06`: el número de pregunta del formulario. */
  id: string;
  /** Tipo de pregunta y base: el denominador de los porcentajes. */
  base: Localized;
  q: Localized;
  bars: Bar[];
  axis: Localized;
  note?: Localized;
  /** Segundo gráfico, cuando la pregunta se recodifica (motivos de baja). */
  bars2?: Bar[];
  axis2?: Localized;
  chips?: Localized[];
  table?: SurveyTable;
  quotes?: Quote[];
  /** La lectura de la pregunta, en párrafos. Admite <b> y se pinta con set:html. */
  read: Localized[];
};

export type RoadmapItem = {
  area: Localized;
  title: Localized;
  /** Los puntos que se explican solos van sin cuerpo. */
  body?: Localized;
};

export type Others = {
  title: Localized;
  body: Localized;
  items: Localized[];
};

/**
 * El JSON se infiere como una unión de formas (unas preguntas traen `table`,
 * otras no), así que el cast pasa por `unknown`. La forma real la comprueba
 * `surveyData.test.ts` campo a campo.
 */
export const questions = raw.questions as unknown as Question[];
export const roadmap = raw.roadmap as unknown as RoadmapItem[];
export const others = raw.others as unknown as Others;

export { loc };
