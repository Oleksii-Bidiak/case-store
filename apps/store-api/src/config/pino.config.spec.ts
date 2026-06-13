import type { ConfigService } from '@nestjs/config';
import { buildPinoHttpOptions } from './pino.config';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a ConfigService mock backed by a plain record. */
function makeConfig(values: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string, defaultValue?: string) => values[key] ?? defaultValue),
  } as unknown as ConfigService;
}

/** Extract the strongly-untyped pinoHttp options for assertions. */
function pinoHttp(values: Record<string, string> = {}) {
  return buildPinoHttpOptions(makeConfig(values)).pinoHttp as Record<string, any>;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('buildPinoHttpOptions', () => {
  // ── Level resolution ─────────────────────────────────────────────────────────

  describe('level', () => {
    it('uses LOG_LEVEL when set', () => {
      expect(pinoHttp({ NODE_ENV: 'production', LOG_LEVEL: 'warn' }).level).toBe('warn');
    });

    it('defaults to debug in development', () => {
      expect(pinoHttp({ NODE_ENV: 'development' }).level).toBe('debug');
    });

    it('defaults to info in production', () => {
      expect(pinoHttp({ NODE_ENV: 'production' }).level).toBe('info');
    });
  });

  // ── Secret redaction (TASK-047-B) ────────────────────────────────────────────

  describe('redact', () => {
    const paths = () => pinoHttp().redact.paths as string[];

    it.each([
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'req.body.password',
      'req.body.passwordHash',
      'req.body.refreshToken',
      'req.body.accessToken',
      'req.body.token',
      'req.body.csrfToken',
    ])('redacts %s', (path) => {
      expect(paths()).toContain(path);
    });

    it('censors with [Redacted]', () => {
      expect(pinoHttp().redact.censor).toBe('[Redacted]');
    });
  });

  // ── Health-probe silencing (TASK-047-B) ──────────────────────────────────────

  describe('autoLogging.ignore', () => {
    it('ignores GET /health', () => {
      expect(pinoHttp().autoLogging.ignore({ url: '/health' })).toBe(true);
    });

    it('does not ignore other routes', () => {
      expect(pinoHttp().autoLogging.ignore({ url: '/api/products' })).toBe(false);
    });
  });

  // ── Request-ID correlation (TASK-047-C) ──────────────────────────────────────

  describe('genReqId', () => {
    it('reuses an incoming X-Request-Id header', () => {
      const setHeader = jest.fn();
      const id = pinoHttp().genReqId({ headers: { 'x-request-id': 'abc-123' } }, { setHeader });

      expect(id).toBe('abc-123');
      expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'abc-123');
    });

    it('generates a UUID when the header is absent', () => {
      const setHeader = jest.fn();
      const id = pinoHttp().genReqId({ headers: {} }, { setHeader });

      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(setHeader).toHaveBeenCalledWith('X-Request-Id', id);
    });

    it('uses the first value when the header is an array', () => {
      const setHeader = jest.fn();
      const id = pinoHttp().genReqId(
        { headers: { 'x-request-id': ['first', 'second'] } },
        { setHeader },
      );

      expect(id).toBe('first');
    });
  });

  // ── Serializers (TASK-047-C) ─────────────────────────────────────────────────

  describe('serializers', () => {
    it('req emits exactly id, method, url, query, remoteAddress (no headers)', () => {
      const out = pinoHttp().serializers.req({
        id: 'req-1',
        method: 'GET',
        url: '/api/products',
        query: { page: '1' },
        remoteAddress: '127.0.0.1',
        headers: { authorization: 'Bearer secret' },
      });

      expect(Object.keys(out).sort()).toEqual(['id', 'method', 'query', 'remoteAddress', 'url']);
      expect(out).not.toHaveProperty('headers');
    });

    it('res emits exactly statusCode', () => {
      const out = pinoHttp().serializers.res({ statusCode: 204, headers: { 'set-cookie': 'x' } });

      expect(Object.keys(out)).toEqual(['statusCode']);
      expect(out.statusCode).toBe(204);
    });

    it('err emits type, message, stack, code', () => {
      const err = new TypeError('boom');
      const out = pinoHttp().serializers.err(err);

      expect(out.type).toBe('TypeError');
      expect(out.message).toBe('boom');
      expect(out).toHaveProperty('stack');
    });
  });

  // ── Transport ────────────────────────────────────────────────────────────────

  describe('transport', () => {
    it('uses pino-pretty outside production', () => {
      expect(pinoHttp({ NODE_ENV: 'development' }).transport).toEqual({
        target: 'pino-pretty',
        options: { colorize: true, singleLine: true },
      });
    });

    it('is undefined in production (raw JSON to stdout)', () => {
      expect(pinoHttp({ NODE_ENV: 'production' }).transport).toBeUndefined();
    });
  });
});
