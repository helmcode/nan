/**
 * Email sending via Resend API — storage-agnostic.
 * Receives API key and sender config as parameters so it can be
 * unit-tested without runtime bindings.
 */

import type { WaitlistRegion } from './waitlist';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function buildConfirmationBody(region: WaitlistRegion): string {
  const regionLabel =
    region === 'EU' ? 'Europa' : region === 'USA' ? 'Estados Unidos' : 'Latinoamérica';

  return [
    'Hola,',
    '',
    '¡Gracias por apuntarte a la lista de espera de NaN Community!',
    '',
    `Tu solicitud para la región ${regionLabel} ha sido registrada correctamente.`,
    'Te avisaremos por email en cuanto haya una plaza disponible para ti.',
    '',
    'Si tienes cualquier duda, responde directo a este correo.',
    '',
    '— Cristian',
    'nan.builders',
  ].join('\n');
}

export interface SendEmailParams {
  to: string;
  region: WaitlistRegion;
  apiKey: string;
  from: string;
}

export type SendEmailOutcome =
  | { ok: true; id: string }
  | { ok: false; error: string; status?: number };

/**
 * Sends a waitlist confirmation email via Resend.
 */
export async function sendConfirmationEmail(
  params: SendEmailParams,
): Promise<SendEmailOutcome> {
  const { to, region, apiKey, from } = params;
  const subject = 'NaN Community — Estás en la lista de espera';
  const text = buildConfirmationBody(region);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, text }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: body, status: response.status };
    }

    const data = (await response.json()) as { id: string };
    return { ok: true, id: data.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
