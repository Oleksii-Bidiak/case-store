import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import type { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';

/**
 * Pino redact paths for sensitive request/response fields.
 *
 * Header paths neutralise credential leakage in the serialized `req`/`res`
 * objects (JWT in `authorization`, session/refresh/cart cookies in `cookie`
 * and `set-cookie`). The `req.body.*` paths are defence-in-depth: pino-http
 * does NOT serialize the request body unless `logBody` is enabled (we never
 * enable it), so they are a zero-cost guard that keeps credentials out of logs
 * if body logging is ever switched on.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.passwordHash',
  'req.body.refreshToken',
  'req.body.accessToken',
  'req.body.token',
  'req.body.csrfToken',
];

/** Minimal shape of the request object pino-http hands to the `req` serializer. */
interface SerializedReq {
  id?: unknown;
  method?: string;
  url?: string;
  query?: unknown;
  remoteAddress?: string;
}

/** Minimal shape of the response object pino-http hands to the `res` serializer. */
interface SerializedRes {
  statusCode?: number;
}

/**
 * Build the `nestjs-pino` `LoggerModule` parameters from runtime config.
 *
 * Centralises every production-grade Pino concern in one pure, testable place:
 * level resolution (LOG_LEVEL override → NODE_ENV default), per-request
 * correlation IDs, secret redaction, trimmed serializers, and health-probe
 * silencing. Returned to `LoggerModule.forRootAsync`'s `useFactory` in
 * `app.module.ts`.
 *
 * @see requirements.md §6 — Logging & Observability
 */
export function buildPinoHttpOptions(configService: ConfigService): Params {
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';
  const level = configService.get<string>('LOG_LEVEL') ?? (isProduction ? 'info' : 'debug');

  return {
    pinoHttp: {
      level,

      // ── Request-ID correlation ───────────────────────────────────────────
      // Reuse an upstream proxy/load-balancer X-Request-Id when present so a
      // single ID spans the whole edge→app trace; otherwise mint a UUID. The
      // chosen ID is reflected back on the response and attached to every
      // pino-http log line for the request (as `reqId`).
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const existing = req.headers['x-request-id'];
        const id = (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },

      // ── Secret redaction ─────────────────────────────────────────────────
      redact: {
        paths: REDACT_PATHS,
        censor: '[Redacted]',
      },

      // ── Trimmed serializers (avoid dumping full req/res/err objects) ──────
      // `req` deliberately omits `headers` — redaction runs on the serialized
      // output, but not emitting headers at all is a stronger guarantee that
      // cookies/authorization never reach the log line.
      serializers: {
        req: (req: SerializedReq) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          query: req.query,
          remoteAddress: req.remoteAddress,
        }),
        res: (res: SerializedRes) => ({
          statusCode: res.statusCode,
        }),
        err: (err: Error & { code?: string }) => ({
          type: err.constructor?.name ?? 'Error',
          message: err.message,
          stack: err.stack,
          code: err.code,
        }),
      },

      // ── Suppress noisy liveness probes ───────────────────────────────────
      // The health route is mounted without the `/api` prefix (see main.ts
      // setGlobalPrefix exclude), so the path to match is `/health`.
      autoLogging: {
        ignore: (req: IncomingMessage) => req.url === '/health',
      },

      // ── pino-pretty in non-production; raw JSON to stdout in production ───
      transport: isProduction
        ? undefined
        : {
            target: 'pino-pretty',
            options: { colorize: true, singleLine: true },
          },
    },
  };
}
