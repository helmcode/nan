import { describe, expect, test } from 'vitest';
import { MEMBERS_NOW, MEMBERS_GOAL, membersPct } from '../../lib/members';
import enData from '../../../i18n/en.json' with { type: 'json' };
import esData from '../../../i18n/es.json' with { type: 'json' };

/**
 * La cuenta de miembros se actualiza a mano al alcanzar un hito (500, 750...).
 * No es un contador en vivo. Lo que se vigila aquí es que siga siendo un solo
 * número para los dos idiomas y que la barra no se salga de la caja.
 */

describe('cuenta de miembros', () => {
  test('el hito no supera la meta', () => {
    expect(MEMBERS_NOW).toBeLessThanOrEqual(MEMBERS_GOAL);
  });

  test('no vuelve al diccionario, donde se duplicaba por idioma', () => {
    const en = enData.nan.community as Record<string, unknown>;
    const es = esData.nan.community as Record<string, unknown>;
    expect(en).not.toHaveProperty('membersNow');
    expect(en).not.toHaveProperty('membersGoal');
    expect(es).not.toHaveProperty('membersNow');
    expect(es).not.toHaveProperty('membersGoal');
  });
});

describe('membersPct', () => {
  test('redondea el porcentaje', () => {
    expect(membersPct(450, 1000)).toBe(45);
    expect(membersPct(1, 3)).toBe(33);
  });

  test('se acota a 0-100 aunque el hito rebase la meta', () => {
    expect(membersPct(1500, 1000)).toBe(100);
    expect(membersPct(-10, 1000)).toBe(0);
  });

  test('una meta inválida no produce NaN ni Infinity en el estilo', () => {
    expect(membersPct(450, 0)).toBe(0);
    expect(membersPct(450, -1)).toBe(0);
  });

  test('por defecto usa los valores publicados', () => {
    expect(membersPct()).toBe(membersPct(MEMBERS_NOW, MEMBERS_GOAL));
  });
});
