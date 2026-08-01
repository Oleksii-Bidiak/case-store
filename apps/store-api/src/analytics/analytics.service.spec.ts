import { AnalyticsService } from './analytics.service';
import { UmamiClient, type UmamiStatsRaw } from './umami.client';

const STATS: UmamiStatsRaw = {
  pageviews: { value: 1240, prev: 1100 },
  visitors: { value: 380, prev: 351 },
  visits: { value: 400, prev: 420 },
  bounces: { value: 200, prev: 180 },
  totaltime: { value: 38_400, prev: 40_000 },
};

describe('AnalyticsService (TASK-380)', () => {
  let umami: jest.Mocked<Pick<UmamiClient, 'isConfigured' | 'getStats'>>;
  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    umami = {
      isConfigured: jest.fn().mockReturnValue(true),
      getStats: jest.fn().mockResolvedValue(STATS),
    };
    service = new AnalyticsService(umami as unknown as UmamiClient);
  });

  it('reports "not configured" without calling the vendor', async () => {
    umami.isConfigured.mockReturnValue(false);

    const summary = await service.getTrafficSummary(7);

    expect(summary.configured).toBe(false);
    expect(summary.available).toBe(false);
    expect(summary.visitors).toBeNull();
    expect(umami.getStats).not.toHaveBeenCalled();
  });

  it('distinguishes "configured but unreachable" from "no traffic"', async () => {
    umami.getStats.mockResolvedValue(null);

    const summary = await service.getTrafficSummary(7);

    expect(summary.configured).toBe(true);
    expect(summary.available).toBe(false);
    // Null, not 0 — a dashboard that draws zeroes here tells the owner their
    // shop lost all its visitors overnight.
    expect(summary.pageviews).toBeNull();
  });

  it('maps the vendor metrics, deriving bounce rate and session length', async () => {
    const summary = await service.getTrafficSummary(7);

    expect(summary).toEqual(
      expect.objectContaining({
        configured: true,
        available: true,
        rangeDays: 7,
        pageviews: 1240,
        visitors: 380,
        visits: 400,
        previousVisitors: 351,
        bounceRate: 0.5, // 200 / 400
        avgVisitSeconds: 96, // 38400 / 400
      }),
    );
  });

  it('leaves the derived metrics null when there were no visits', async () => {
    umami.getStats.mockResolvedValue({
      pageviews: { value: 0 },
      visitors: { value: 0 },
      visits: { value: 0 },
      bounces: { value: 0 },
      totaltime: { value: 0 },
    });

    const summary = await service.getTrafficSummary(30);

    // 0/0 would serialise as null anyway — but as NaN it would first pass
    // through every downstream format() as "NaN%".
    expect(summary.bounceRate).toBeNull();
    expect(summary.avgVisitSeconds).toBeNull();
    expect(summary.available).toBe(true);
    expect(summary.pageviews).toBe(0);
  });

  it('asks the vendor for the requested window, ending now', async () => {
    const before = Date.now();

    await service.getTrafficSummary(14);

    const [startAt, endAt] = umami.getStats.mock.calls[0];
    expect(endAt).toBeGreaterThanOrEqual(before);
    expect(endAt - startAt).toBe(14 * 24 * 60 * 60 * 1000);
  });
});
