import type { HelmetOptions } from 'helmet';

/**
 * Build the Helmet configuration for the given environment.
 *
 * Shared between `main.ts` (runtime) and the security e2e/unit tests so the
 * asserted headers never drift from what is actually served.
 *
 * - Production: strict CSP (scripts/styles `'self'` only), 1-year HSTS with
 *   subdomains, upgrade-insecure-requests.
 * - Development: CSP relaxed so the Swagger UI (`/api/docs`) — which injects
 *   inline scripts and loads assets from cdn.jsdelivr.net — works; HSTS off so
 *   browsers don't pin the insecure HTTP host.
 */
export function buildHelmetOptions(isProduction: boolean): HelmetOptions {
  return {
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
          },
        }
      : {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
            styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
            imgSrc: ["'self'", 'data:', 'cdn.jsdelivr.net'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'cdn.jsdelivr.net'],
            objectSrc: ["'none'"],
          },
        },
    strictTransportSecurity: isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  };
}
