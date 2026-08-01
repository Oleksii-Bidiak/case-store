import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { UmamiClient, type UmamiStatsRaw } from './umami.client';

const loggerMock = {
  setContext: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;

const FULL_CONFIG = {
  UMAMI_API_URL: 'http://umami:3000',
  UMAMI_API_USERNAME: 'reader',
  UMAMI_API_PASSWORD: 'secret',
  UMAMI_WEBSITE_ID: 'site-uuid',
};

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const STATS: UmamiStatsRaw = {
  pageviews: { value: 1240, prev: 1100 },
  visitors: { value: 380, prev: 351 },
  visits: { value: 460, prev: 420 },
  bounces: { value: 193, prev: 180 },
  totaltime: { value: 44_160, prev: 40_000 },
};

/** A `fetch` double that answers login + stats, recording the calls it saw. */
function makeFetch(
  handlers: {
    login?: () => Response | Promise<Response>;
    stats?: () => Response | Promise<Response>;
  } = {},
) {
  const calls: string[] = [];
  const impl = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/api/auth/login')) {
      return handlers.login
        ? handlers.login()
        : (new Response(JSON.stringify({ token: 'tok-1' }), { status: 200 }) as Response);
    }
    return handlers.stats
      ? handlers.stats()
      : (new Response(JSON.stringify(STATS), { status: 200 }) as Response);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('UmamiClient (TASK-380)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('isConfigured', () => {
    it.each([
      ['nothing set', {}],
      ['no website id', { ...FULL_CONFIG, UMAMI_WEBSITE_ID: undefined }],
      ['no password', { ...FULL_CONFIG, UMAMI_API_PASSWORD: undefined }],
      ['blank url', { ...FULL_CONFIG, UMAMI_API_URL: '' }],
    ])('is false with %s — the integration is all-or-nothing', (_label, values) => {
      const client = new UmamiClient(makeConfig(values), loggerMock);
      expect(client.isConfigured()).toBe(false);
    });

    it('is true once all four settings are present', () => {
      const client = new UmamiClient(makeConfig(FULL_CONFIG), loggerMock);
      expect(client.isConfigured()).toBe(true);
    });
  });

  it('makes no network call at all when unconfigured', async () => {
    const { impl } = makeFetch();
    const client = new UmamiClient(makeConfig({}), loggerMock, impl);

    await expect(client.getStats(1, 2)).resolves.toBeNull();
    expect(impl).not.toHaveBeenCalled();
  });

  it('logs in once and reuses the token for later calls', async () => {
    const { impl, calls } = makeFetch();
    const client = new UmamiClient(makeConfig(FULL_CONFIG), loggerMock, impl);

    await client.getStats(1000, 2000);
    await client.getStats(3000, 4000);

    expect(calls.filter((u) => u.includes('/api/auth/login'))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('/stats'))).toHaveLength(2);
  });

  it('requests the window it was given, against the configured website', async () => {
    const { impl, calls } = makeFetch();
    const client = new UmamiClient(makeConfig(FULL_CONFIG), loggerMock, impl);

    await client.getStats(1000, 2000);

    expect(calls.at(-1)).toBe(
      'http://umami:3000/api/websites/site-uuid/stats?startAt=1000&endAt=2000',
    );
  });

  it('strips a trailing slash from the base URL', async () => {
    const { impl, calls } = makeFetch();
    const client = new UmamiClient(
      makeConfig({ ...FULL_CONFIG, UMAMI_API_URL: 'http://umami:3000/' }),
      loggerMock,
      impl,
    );

    await client.getStats(1, 2);

    // `//api/auth/login` is the classic 404 this guards against.
    expect(calls[0]).toBe('http://umami:3000/api/auth/login');
  });

  it('re-authenticates once when the cached token is rejected', async () => {
    let statsCall = 0;
    const { impl, calls } = makeFetch({
      stats: () => {
        statsCall += 1;
        return statsCall === 1
          ? (new Response(null, { status: 401 }) as Response)
          : (new Response(JSON.stringify(STATS), { status: 200 }) as Response);
      },
    });
    const client = new UmamiClient(makeConfig(FULL_CONFIG), loggerMock, impl);

    await expect(client.getStats(1, 2)).resolves.toEqual(STATS);
    // Two logins: the first token was rejected, so it is dropped and re-issued
    // rather than muting the card until the next deploy.
    expect(calls.filter((u) => u.includes('/api/auth/login'))).toHaveLength(2);
  });

  it('gives up after a second 401 instead of looping', async () => {
    const { impl, calls } = makeFetch({
      stats: () => new Response(null, { status: 401 }) as Response,
    });
    const client = new UmamiClient(makeConfig(FULL_CONFIG), loggerMock, impl);

    await expect(client.getStats(1, 2)).resolves.toBeNull();
    expect(calls.filter((u) => u.includes('/stats'))).toHaveLength(2);
  });

  it.each([
    ['login fails', { login: () => new Response(null, { status: 500 }) as Response }],
    ['login returns no token', { login: () => Response.json({}) as Response }],
    ['stats fails', { stats: () => new Response(null, { status: 503 }) as Response }],
  ])('returns null (never zeroes) when %s', async (_label, handlers) => {
    const { impl } = makeFetch(handlers);
    const client = new UmamiClient(makeConfig(FULL_CONFIG), loggerMock, impl);

    // null means "unknown". Zero metrics would tell the owner their shop lost
    // all its traffic, which is a very different message.
    await expect(client.getStats(1, 2)).resolves.toBeNull();
  });

  it('returns null when the network throws', async () => {
    const impl = jest.fn(() =>
      Promise.reject(new Error('ECONNREFUSED')),
    ) as unknown as typeof fetch;
    const client = new UmamiClient(makeConfig(FULL_CONFIG), loggerMock, impl);

    await expect(client.getStats(1, 2)).resolves.toBeNull();
  });
});
