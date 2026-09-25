import { kyivDayRange } from './kyiv-day';

/**
 * TASK-787: the admin date filter is a CALENDAR filter — "orders from the 24th"
 * means the shop's 24th, in Kyiv, start to finish. `new Date('2026-09-24')` is
 * UTC midnight, which is 03:00 in Kyiv in summer, and as an upper bound it cut
 * off the whole day (dateFrom = dateTo = today gave total: 0).
 */
describe('kyivDayRange', () => {
  it('covers a summer (EEST, UTC+3) day start to finish', () => {
    expect(kyivDayRange('2026-09-24')).toEqual({
      start: new Date('2026-09-23T21:00:00.000Z'),
      end: new Date('2026-09-24T21:00:00.000Z'),
    });
  });

  it('covers a winter (EET, UTC+2) day start to finish', () => {
    expect(kyivDayRange('2026-01-15')).toEqual({
      start: new Date('2026-01-14T22:00:00.000Z'),
      end: new Date('2026-01-15T22:00:00.000Z'),
    });
  });

  it('gives the spring-forward day its 23 hours', () => {
    // Clocks go 03:00 → 04:00 on the last Sunday of March.
    const { start, end } = kyivDayRange('2026-03-29');
    expect(start).toEqual(new Date('2026-03-28T22:00:00.000Z'));
    expect(end).toEqual(new Date('2026-03-29T21:00:00.000Z'));
    expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it('gives the fall-back day its 25 hours', () => {
    // Clocks go 04:00 → 03:00 on the last Sunday of October.
    const { start, end } = kyivDayRange('2026-10-25');
    expect(start).toEqual(new Date('2026-10-24T21:00:00.000Z'));
    expect(end).toEqual(new Date('2026-10-25T22:00:00.000Z'));
    expect(end.getTime() - start.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it('reads a full timestamp as the Kyiv day that instant falls on', () => {
    // 23:30 UTC on the 24th is already 02:30 on the 25th in Kyiv.
    expect(kyivDayRange('2026-09-24T23:30:00.000Z')).toEqual(kyivDayRange('2026-09-25'));
  });

  it('crosses a month and a year boundary', () => {
    expect(kyivDayRange('2026-12-31').end).toEqual(new Date('2026-12-31T22:00:00.000Z'));
  });
});
