import { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { RevalidationNotifier } from './revalidation.notifier';

const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  setContext: jest.fn(),
};

function buildNotifier(config: Record<string, string | undefined>): RevalidationNotifier {
  const configMock = {
    get: jest.fn((key: string) => config[key]),
  };
  return new RevalidationNotifier(
    configMock as unknown as ConfigService,
    loggerMock as unknown as PinoLogger,
  );
}

describe('RevalidationNotifier', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('is a no-op when the URL/secret are unconfigured', async () => {
    const notifier = buildNotifier({});

    await notifier.revalidate({ tags: ['pages'] });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // TASK-383: the disabled state used to be completely silent on both sides,
  // which is how a demo server ran for days with revalidation dead.
  it('announces the disabled state once at boot (debug outside production)', () => {
    const notifier = buildNotifier({});

    notifier.onModuleInit();

    expect(loggerMock.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'revalidate.notify.disabled',
        missing: ['STOREFRONT_REVALIDATE_URL', 'REVALIDATE_SECRET'],
      }),
      expect.any(String),
    );
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it('escalates the disabled state to error in production', () => {
    const notifier = buildNotifier({
      NODE_ENV: 'production',
      STOREFRONT_REVALIDATE_URL: 'https://shop.test/api/revalidate',
    });

    notifier.onModuleInit();

    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'revalidate.notify.disabled',
        missing: ['REVALIDATE_SECRET'],
      }),
      expect.any(String),
    );
  });

  it('stays quiet at boot when fully configured', () => {
    const notifier = buildNotifier({
      STOREFRONT_REVALIDATE_URL: 'https://shop.test/api/revalidate',
      REVALIDATE_SECRET: 's3cret',
    });

    notifier.onModuleInit();

    expect(loggerMock.debug).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it('POSTs tags + paths with the secret header when configured', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const notifier = buildNotifier({
      STOREFRONT_REVALIDATE_URL: 'https://shop.test/api/revalidate',
      REVALIDATE_SECRET: 's3cret',
    });

    await notifier.revalidate({ tags: ['pages', 'page:faq'], paths: ['/legal'] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://shop.test/api/revalidate');
    expect(init.method).toBe('POST');
    expect(init.headers['x-revalidate-secret']).toBe('s3cret');
    expect(JSON.parse(init.body)).toEqual({
      tags: ['pages', 'page:faq'],
      paths: ['/legal'],
    });
    // A hung storefront must not hold the admin's write open (TASK-383).
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('never throws when fetch rejects (best-effort)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const notifier = buildNotifier({
      STOREFRONT_REVALIDATE_URL: 'https://shop.test/api/revalidate',
      REVALIDATE_SECRET: 's3cret',
    });

    await expect(notifier.revalidate({ tags: ['pages'] })).resolves.toBeUndefined();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'revalidate.notify.error' }),
      expect.any(String),
    );
  });

  it('logs a warning on a non-OK response but does not throw', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const notifier = buildNotifier({
      STOREFRONT_REVALIDATE_URL: 'https://shop.test/api/revalidate',
      REVALIDATE_SECRET: 's3cret',
    });

    await expect(notifier.revalidate({ tags: ['pages'] })).resolves.toBeUndefined();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'revalidate.notify.failed', status: 401 }),
      expect.any(String),
    );
  });
});
