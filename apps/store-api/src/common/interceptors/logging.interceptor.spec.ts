import { lastValueFrom, of, throwError } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { LoggingInterceptor } from './logging.interceptor';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLogger(): jest.Mocked<Pick<PinoLogger, 'info' | 'error' | 'setContext'>> {
  return {
    info: jest.fn(),
    error: jest.fn(),
    setContext: jest.fn(),
  };
}

function makeContext(method = 'GET', url = '/api/products', statusCode = 200): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, url }),
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('LoggingInterceptor', () => {
  let logger: ReturnType<typeof makeLogger>;
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    logger = makeLogger();
    interceptor = new LoggingInterceptor(logger as unknown as PinoLogger);
  });

  it('sets the HTTP logging context', () => {
    expect(logger.setContext).toHaveBeenCalledWith('HTTP');
  });

  describe('success path', () => {
    it('passes the value through and does NOT log (autoLogging owns request logs)', async () => {
      const next: CallHandler = { handle: () => of({ ok: true }) };

      const result = await lastValueFrom(interceptor.intercept(makeContext(), next));

      expect(result).toEqual({ ok: true });
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('error path', () => {
    it('logs structured error context with statusCode, duration, method and url', async () => {
      const error = Object.assign(new Error('boom'), { status: 422 });
      const next: CallHandler = { handle: () => throwError(() => error) };

      await expect(
        lastValueFrom(interceptor.intercept(makeContext('POST', '/api/orders'), next)),
      ).rejects.toThrow('boom');

      expect(logger.error).toHaveBeenCalledTimes(1);
      const [fields] = logger.error.mock.calls[0];
      expect(fields).toMatchObject({
        statusCode: 422,
        method: 'POST',
        url: '/api/orders',
      });
      expect(fields).toHaveProperty('duration');
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('defaults to status 500 when the error has no status', async () => {
      const next: CallHandler = { handle: () => throwError(() => new Error('kaboom')) };

      await expect(lastValueFrom(interceptor.intercept(makeContext(), next))).rejects.toThrow();

      const [fields] = logger.error.mock.calls[0];
      expect(fields).toMatchObject({ statusCode: 500 });
    });
  });
});
