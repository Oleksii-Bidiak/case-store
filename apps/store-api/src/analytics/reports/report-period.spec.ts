import { BadRequestException } from '@nestjs/common';
import { lastKyivDays, resolveReportPeriod } from './report-period';

/**
 * TASK-685: one period resolver for every report. It returns TWO ranges — the
 * chosen one and the one it is compared against — as Kyiv calendar days plus
 * the half-open UTC instants a WHERE filters on. Comparison rules are the
 * owner's decision of 2026-09-26: rolling presets and custom ranges compare to
 * the equal run of days right before; month presets compare calendar months.
 */
describe('resolveReportPeriod', () => {
  // 14:00 in Kyiv on Saturday 26 September 2026 (EEST, UTC+3).
  const NOW = new Date('2026-09-26T11:00:00.000Z');

  it('defaults to the last 30 Kyiv days, today included', () => {
    const period = resolveReportPeriod({}, NOW);
    expect(period.preset).toBe('30d');
    expect(period.current).toMatchObject({ fromDay: '2026-08-28', toDay: '2026-09-26', days: 30 });
    expect(period.previous).toMatchObject({ fromDay: '2026-07-29', toDay: '2026-08-27', days: 30 });
  });

  it('turns calendar days into half-open Kyiv instants', () => {
    const { current } = resolveReportPeriod({ preset: '7d' }, NOW);
    expect(current).toMatchObject({ fromDay: '2026-09-20', toDay: '2026-09-26', days: 7 });
    expect(current.start).toEqual(new Date('2026-09-19T21:00:00.000Z'));
    expect(current.end).toEqual(new Date('2026-09-26T21:00:00.000Z'));
  });

  it('takes "today" from Kyiv, not UTC, just after Kyiv midnight', () => {
    // 00:30 in Kyiv on 1 September = 21:30 UTC on 31 August.
    const { current } = resolveReportPeriod(
      { preset: 'this-month' },
      new Date('2026-08-31T21:30:00.000Z'),
    );
    expect(current).toMatchObject({ fromDay: '2026-09-01', toDay: '2026-09-01', days: 1 });
  });

  it('compares 90 days with the 90 days right before', () => {
    const { current, previous } = resolveReportPeriod({ preset: '90d' }, NOW);
    expect(current).toMatchObject({ fromDay: '2026-06-29', toDay: '2026-09-26', days: 90 });
    expect(previous).toMatchObject({ fromDay: '2026-03-31', toDay: '2026-06-28', days: 90 });
  });

  it('compares this month (1…N) with days 1…N of the previous month', () => {
    const { current, previous } = resolveReportPeriod({ preset: 'this-month' }, NOW);
    expect(current).toMatchObject({ fromDay: '2026-09-01', toDay: '2026-09-26', days: 26 });
    expect(previous).toMatchObject({ fromDay: '2026-08-01', toDay: '2026-08-26', days: 26 });
  });

  it('clips the comparison to the end of a shorter previous month', () => {
    // 31 October → September has only 30 days.
    const oct31 = resolveReportPeriod(
      { preset: 'this-month' },
      new Date('2026-10-31T10:00:00.000Z'),
    );
    expect(oct31.current).toMatchObject({ fromDay: '2026-10-01', toDay: '2026-10-31', days: 31 });
    expect(oct31.previous).toMatchObject({ fromDay: '2026-09-01', toDay: '2026-09-30', days: 30 });
    // 30 March → February 2026 has 28.
    const mar30 = resolveReportPeriod(
      { preset: 'this-month' },
      new Date('2026-03-30T10:00:00.000Z'),
    );
    expect(mar30.previous).toMatchObject({ fromDay: '2026-02-01', toDay: '2026-02-28', days: 28 });
  });

  it('compares last month with the whole month before it', () => {
    const { current, previous } = resolveReportPeriod({ preset: 'last-month' }, NOW);
    expect(current).toMatchObject({ fromDay: '2026-08-01', toDay: '2026-08-31', days: 31 });
    expect(previous).toMatchObject({ fromDay: '2026-07-01', toDay: '2026-07-31', days: 31 });
  });

  it('crosses the year boundary for "last month" in January', () => {
    const { current, previous } = resolveReportPeriod(
      { preset: 'last-month' },
      new Date('2027-01-15T10:00:00.000Z'),
    );
    expect(current).toMatchObject({ fromDay: '2026-12-01', toDay: '2026-12-31', days: 31 });
    expect(previous).toMatchObject({ fromDay: '2026-11-01', toDay: '2026-11-30', days: 30 });
    // 1 December 00:00 Kyiv (winter, UTC+2) → 31 December 24:00 Kyiv.
    expect(current.start).toEqual(new Date('2026-11-30T22:00:00.000Z'));
    expect(current.end).toEqual(new Date('2026-12-31T22:00:00.000Z'));
  });

  it('gives a month with a DST switch its true instant length', () => {
    // October 2026: clocks go back on the 25th, so the month is 31 days + 1 hour.
    const { current } = resolveReportPeriod(
      { preset: 'last-month' },
      new Date('2026-11-10T10:00:00.000Z'),
    );
    expect(current.start).toEqual(new Date('2026-09-30T21:00:00.000Z'));
    expect(current.end).toEqual(new Date('2026-10-31T22:00:00.000Z'));
    expect(current.end.getTime() - current.start.getTime()).toBe((31 * 24 + 1) * 3_600_000);
  });

  it('handles the spring-forward day inside a custom range', () => {
    const { current } = resolveReportPeriod(
      { preset: 'custom', from: '2026-03-29', to: '2026-03-29' },
      NOW,
    );
    expect(current.days).toBe(1);
    expect(current.end.getTime() - current.start.getTime()).toBe(23 * 3_600_000);
  });

  it('compares a one-day custom range with the day before', () => {
    const { current, previous } = resolveReportPeriod(
      { preset: 'custom', from: '2026-09-01', to: '2026-09-01' },
      NOW,
    );
    expect(current).toMatchObject({ fromDay: '2026-09-01', toDay: '2026-09-01', days: 1 });
    expect(previous).toMatchObject({ fromDay: '2026-08-31', toDay: '2026-08-31', days: 1 });
  });

  it('compares a custom range with the equal run of days right before', () => {
    const { previous } = resolveReportPeriod(
      { preset: 'custom', from: '2026-08-01', to: '2026-08-31' },
      NOW,
    );
    expect(previous).toMatchObject({ fromDay: '2026-07-01', toDay: '2026-07-31', days: 31 });
  });

  it('allows a custom range that ends today', () => {
    const { current } = resolveReportPeriod(
      { preset: 'custom', from: '2026-09-20', to: '2026-09-26' },
      NOW,
    );
    expect(current.days).toBe(7);
  });

  describe('rejects a custom range that cannot be answered', () => {
    const cases: Array<[string, { from?: string; to?: string }]> = [
      ['without from', { to: '2026-09-01' }],
      ['without to', { from: '2026-09-01' }],
      ['with an impossible date', { from: '2026-02-30', to: '2026-03-01' }],
      ['with a timestamp instead of a day', { from: '2026-09-01T00:00:00Z', to: '2026-09-02' }],
      ['ending before it starts', { from: '2026-09-10', to: '2026-09-01' }],
      ['ending in the future', { from: '2026-09-20', to: '2026-09-27' }],
      ['longer than 366 days', { from: '2025-09-24', to: '2026-09-25' }],
    ];
    it.each(cases)('%s', (_label, range) => {
      expect(() => resolveReportPeriod({ preset: 'custom', ...range }, NOW)).toThrow(
        BadRequestException,
      );
    });
  });

  it('ignores from/to for a preset (the preset wins)', () => {
    const { current } = resolveReportPeriod(
      { preset: '7d', from: '2020-01-01', to: '2020-01-02' },
      NOW,
    );
    expect(current.fromDay).toBe('2026-09-20');
  });
});

describe('lastKyivDays (TASK-694)', () => {
  it('is the same range as the matching preset — one "last 30 days" everywhere', () => {
    const now = new Date('2026-09-26T11:00:00.000Z');
    expect(lastKyivDays(30, now)).toEqual(resolveReportPeriod({ preset: '30d' }, now).current);
  });

  it('starts at Kyiv midnight, not the server’s', () => {
    // 00:30 Kyiv on 1 September — still 31 August in UTC.
    const range = lastKyivDays(1, new Date('2026-08-31T21:30:00.000Z'));
    expect(range).toMatchObject({ fromDay: '2026-09-01', toDay: '2026-09-01', days: 1 });
    expect(range.start).toEqual(new Date('2026-08-31T21:00:00.000Z'));
  });
});
