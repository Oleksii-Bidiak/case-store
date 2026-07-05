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
