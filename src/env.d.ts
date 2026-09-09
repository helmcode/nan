/// <reference types="astro/client" />

// Replica la forma que `wrangler types` genera en
// `worker-configuration.d.ts` (que está en el gitignore). Declararla aquí
// mantiene en verde la comprobación de tipos en CI aunque falte el fichero
// generado por wrangler, y TS fusiona las dos declaraciones cuando SÍ está en local.
declare namespace Cloudflare {
  interface Env {
    RESEND_API_KEY: string;
    RESEND_FROM_EMAIL: string;
    CLOUD_API_URL: string;
    CLOUD_API_WAITLIST_KEY: string;
    // Opcionales: las dos caen a los valores por defecto de src/lib/rateLimits.ts.
    RATE_LIMIT_RPM?: string;
    RATE_LIMIT_PARALLEL?: string;
  }
}

interface Env extends Cloudflare.Env {}
