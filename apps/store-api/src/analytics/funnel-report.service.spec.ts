import { CacheService } from '../cache';
import { FunnelReportService } from './funnel-report.service';
import { ReportCache } from './reports/report-cache';
import { UmamiClient } from './umami.client';

/**
 * TASK-689: the funnel from Umami, with the three states of the traffic card —
 * never "0%" for "not connected" or "did not answer".
 */
describe('FunnelReportService (TASK-689)', () => {
  const NOW = new Date('2026-09-26T12:00:00.000Z');
  const AUGUST = { preset: 'custom' as const, from: '2026-08-01', to: '2026-08-31' };

  function setup(opts: { configured?: boolean; counts?: Array<Record<string, number> | null> }) {
    const answers = [...(opts.counts ?? [])];
    const umami = {
      isConfigured: jest.fn(() => opts.configured ?? true),
      getEventCounts: jest.fn(async () => answers.shift() ?? null),
    };
    const store = new Map<string, unknown>();
    const cache = {
      get: jest.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
      set: jest.fn(async (key: string, value: unknown) => void store.set(key, value)),
    };
    const service = new FunnelReportService(
      umami as unknown as UmamiClient,
      new ReportCache(cache as unknown as CacheService),
    );
    return { service, umami, cache };
  }

  it('says "not configured" with nulls and asks Umami nothing', async () => {
    const { service, umami } = setup({ configured: false });

    const report = await service.getFunnelReport(AUGUST, NOW);

    expect(report).toMatchObject({
      configured: false,
      available: false,
      steps: null,
      transitions: null,
      conversion: null,
      previousConversion: null,
    });
    expect(report.period).toMatchObject({ from: '2026-08-01', to: '2026-08-31' });
    expect(umami.getEventCounts).not.toHaveBeenCalled();
  });

  it('says "did not answer" with nulls — and does not cache it', async () => {
    const { service, cache } = setup({ counts: [null, { add_to_cart: 5 }] });

    const report = await service.getFunnelReport(AUGUST, NOW);

    expect(report).toMatchObject({
      configured: true,
      available: false,
      steps: null,
      conversion: null,
    });
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('builds the three steps, the transitions and the conversion from Umami alone', async () => {
    const { service, umami, cache } = setup({
      counts: [
        { add_to_cart: 40, begin_checkout: 12, purchase: 5, view_product: 900 },
        { add_to_cart: 20, begin_checkout: 10, purchase: 2 },
      ],
    });

    const report = await service.getFunnelReport(AUGUST, NOW);

    expect(report.steps).toEqual([
      { event: 'add_to_cart', count: { current: 40, previous: 20, changePct: 100 } },
      { event: 'begin_checkout', count: { current: 12, previous: 10, changePct: 20 } },
      { event: 'purchase', count: { current: 5, previous: 2, changePct: 150 } },
    ]);
    expect(report.transitions).toEqual([
      { from: 'add_to_cart', to: 'begin_checkout', rate: 0.3, previousRate: 0.5 },
      { from: 'begin_checkout', to: 'purchase', rate: 0.4167, previousRate: 0.2 },
    ]);
    expect(report.conversion).toBe(0.125);
    expect(report.previousConversion).toBe(0.1);
    expect(cache.set).toHaveBeenCalledTimes(1);

    // Kyiv August as epoch ms, end inclusive (Umami's window is closed).
    expect(umami.getEventCounts).toHaveBeenCalledWith(
      new Date('2026-07-31T21:00:00.000Z').getTime(),
      new Date('2026-08-31T21:00:00.000Z').getTime() - 1,
    );
  });

  it('shows real zeros as zeros, and an undefined share as null — never 0%', async () => {
    const { service } = setup({ counts: [{}, {}] });

    const report = await service.getFunnelReport(AUGUST, NOW);

    expect(report.available).toBe(true);
    expect(report.steps?.map((s) => s.count.current)).toEqual([0, 0, 0]);
    expect(report.conversion).toBeNull();
    expect(report.transitions?.every((t) => t.rate === null)).toBe(true);
  });
});
