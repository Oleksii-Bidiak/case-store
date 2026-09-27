import { CacheService } from '../../cache';
import { ReportCache, reportCacheKey, REPORT_CACHE_TTL_SECONDS } from './report-cache';
import { resolveReportPeriod } from './report-period';

/** A CacheService stand-in backed by a Map — enough to observe keys and hits. */
function mapCache() {
  const store = new Map<string, unknown>();
  const cache = {
    get: jest.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
  };
  return { store, cache: cache as unknown as CacheService, raw: cache };
}

describe('report cache (TASK-685)', () => {
  const NOW = new Date('2026-09-26T11:00:00.000Z');
  const period = resolveReportPeriod({ preset: '30d' }, NOW);

  it('puts the actor’s money right into the key', () => {
    const withMoney = reportCacheKey({ report: 'categories', period, hasRevenue: true });
    const withoutMoney = reportCacheKey({ report: 'categories', period, hasRevenue: false });
    expect(withMoney).not.toBe(withoutMoney);
    expect(withMoney).toContain('rev=1');
    expect(withoutMoney).toContain('rev=0');
  });

  it('keys on report, preset, range and extra inputs', () => {
    const key = reportCacheKey({
      report: 'categories',
      period,
      hasRevenue: false,
      extra: 'parent=a|b',
    });
    expect(key).toBe('analytics:report:categories:30d:2026-08-28:2026-09-26:rev=0:parent%3Da%7Cb');
    // Same days, different comparison → different entry.
    const custom = resolveReportPeriod(
      { preset: 'custom', from: '2026-08-28', to: '2026-09-26' },
      NOW,
    );
    expect(reportCacheKey({ report: 'categories', period: custom, hasRevenue: false })).not.toBe(
      reportCacheKey({ report: 'categories', period, hasRevenue: false }),
    );
  });

  it('never serves a money answer to an actor without the right', async () => {
    const { cache } = mapCache();
    const reports = new ReportCache(cache);

    const rich = await reports.getOrCompute(
      { report: 'products', period, hasRevenue: true },
      async () => ({ rows: [{ units: 3, revenue: 4200 }] }),
    );
    const plain = await reports.getOrCompute(
      { report: 'products', period, hasRevenue: false },
      async () => ({ rows: [{ units: 3 }] }),
    );

    expect(rich.rows[0]).toHaveProperty('revenue', 4200);
    expect(plain.rows[0]).not.toHaveProperty('revenue');
  });

  it('serves the second identical request from the cache with a five-minute TTL', async () => {
    const { cache, raw } = mapCache();
    const reports = new ReportCache(cache);
    const compute = jest.fn(async () => ({ total: 1 }));

    await reports.getOrCompute({ report: 'sales', period, hasRevenue: true }, compute);
    await reports.getOrCompute({ report: 'sales', period, hasRevenue: true }, compute);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(raw.set).toHaveBeenCalledWith(
      expect.any(String),
      { total: 1 },
      REPORT_CACHE_TTL_SECONDS,
    );
  });

  it('does not store an answer the report marks as not cacheable', async () => {
    const { cache, raw } = mapCache();
    const reports = new ReportCache(cache);
    const compute = jest.fn(async () => ({ available: false }));

    await reports.getOrCompute(
      { report: 'funnel', period, hasRevenue: false },
      compute,
      (value) => value.available,
    );
    await reports.getOrCompute(
      { report: 'funnel', period, hasRevenue: false },
      compute,
      (value) => value.available,
    );

    expect(raw.set).not.toHaveBeenCalled();
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
