import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import modelos from '../../data/modelos.json';
import { DEFAULT_RATE_LIMITS, formatTokens } from '../../lib/rateLimits';

/**
 * La fila del modelo premium en la tabla de la home.
 *
 * Es la única de la tabla que un miembro NO puede llamar con su key: necesita
 * el cambio de precio a 200 EUR. Sin marca, la fila dice lo contrario que
 * `/docs/models` y que la sección de precios, porque el resto de la tabla es
 * justo lo que entra con la sub normal. Y su cuota es la única que no se
 * reinicia con el mes natural, sino con el periodo de facturación de Stripe,
 * que es por lo que ninguna superficie la escribe como mensual.
 */

const here = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(resolve(here, '../../components/nan/home/Models.astro'), 'utf-8');

const llm = modelos.categorias.find((c) => c.id === 'llm')!;
const premium = llm.modelos.filter((m) => 'premium' in m && m.premium) as Array<{
  id: string;
  specs: string;
  cuota: string;
}>;

describe('tabla de modelos — la fila premium', () => {
  test('el modelo premium está en la tabla y es solo uno', () => {
    expect(premium.map((m) => m.id)).toEqual(['glm5.3']);
  });

  test('publica el contexto y la multimodalidad que sirve el cluster', () => {
    const { specs } = premium[0];
    const glm = DEFAULT_RATE_LIMITS.windowedModels.find((m) => m.model === 'glm5.3')!;
    expect(specs).toContain(`${formatTokens(glm.contextTokens)} context`);
    expect(specs).toContain('multimodal');
    // El 5.2 era solo texto, y la ficha de docs lo decía.
    expect(specs).not.toMatch(/text only|solo texto/i);
  });

  test('la cuota va por periodo de facturación, no por mes', () => {
    expect(premium[0].cuota).toBe('3B tokens/periodo de facturación');
    expect(premium[0].cuota).not.toContain('/mes');
  });

  test('el componente marca la fila y traduce su cuota al inglés', () => {
    expect(component).toContain('badge--premium');
    expect(component).toContain('tt.badgePremium');
    expect(component).toContain("'/periodo de facturación', ' / billing period'");
  });

  test('ningún otro modelo de la tabla queda marcado como premium', () => {
    const otras = modelos.categorias
      .flatMap((c) => c.modelos)
      .filter((m) => 'premium' in m && m.premium);
    expect(otras).toHaveLength(1);
  });
});
