/**
 * Cuenta de miembros que pinta la barra de progreso de /community.
 *
 * Se actualiza A MANO, y a propósito: no es un contador en vivo, es el hito
 * alcanzado. Cuando la comunidad pase de 500, de 750, etc., se sube el número
 * de aquí y ya está. cloud-api no expone la cuenta públicamente y tampoco hace
 * falta: un número que se mueve solo daría una precisión que nadie pidió.
 *
 * Vive aquí y no en `i18n/{en,es}.json` porque allí estaba duplicado en los dos
 * idiomas: si se actualizaba uno y no el otro, la web inglesa y la española
 * mostraban cifras distintas. Un número no se traduce.
 *
 * Al subir MEMBERS_NOW, comprobar que el hito concuerda con la fila "1,000
 * members" del roadmap (`nan.community.roadmap`), que es la que da la meta.
 */

/** Último hito alcanzado. Actualizar a mano al superarlo. */
export const MEMBERS_NOW = 450;

/** Meta pública, la del roadmap. */
export const MEMBERS_GOAL = 1000;

/** Porcentaje para la barra, acotado a 0-100 por si el hito rebasa la meta. */
export const membersPct = (now = MEMBERS_NOW, goal = MEMBERS_GOAL): number => {
  if (!goal || goal <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((now / goal) * 100)));
};
