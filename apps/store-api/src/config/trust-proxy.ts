import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * How many reverse proxies sit in front of this app.
 *
 * One: Caddy, on the compose network (`Caddyfile` → `reverse_proxy store-api`).
 * Raise it only if a second proxy is ever placed in front of Caddy — every extra
 * hop is one more `X-Forwarded-For` entry the app agrees to believe.
 *
 * Deliberately a NUMBER and never `true`. `true` trusts the entire chain, which
 * means any client can prepend an address of their choosing and be counted as
 * whoever they like — rotating it would turn the rate limiter off for them
 * entirely. With one trusted hop Express takes the last `X-Forwarded-For` entry,
 * and Caddy appends the real peer to that header, so a request arriving with a
 * forged `X-Forwarded-For: 9.9.9.9` becomes `9.9.9.9, <real>` and Express still
 * resolves `<real>`.
 */
export const TRUSTED_PROXY_HOPS = 1;

/**
 * Teach Express that it is behind a reverse proxy, so `req.ip` is the visitor
 * rather than the proxy (TASK-386).
 *
 * Extracted from `main.ts` so the e2e harness — which builds its app through
 * `createNestApplication()` and never runs `main.ts` — exercises the SAME
 * setting the deployed process does. Without that, the rate-limit tests would
 * pass against a configuration production does not have, which is how the
 * original bug survived: every visitor behind Caddy was reported as the Caddy
 * container's address, so the global 100-requests-per-minute limiter counted the
 * whole shop as one client, and nothing anywhere said so.
 */
export function applyProxyTrust(app: NestExpressApplication): void {
  app.set('trust proxy', TRUSTED_PROXY_HOPS);
}
