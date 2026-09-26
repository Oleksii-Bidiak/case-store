import { Prisma } from '@prisma/client';
import {
  addDays,
  daysInclusive,
  isCalendarDay,
  kyivDateOf,
  kyivDayRange,
  kyivDaySql,
  monthEnd,
  monthStart,
} from './kyiv-day';

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

describe('calendar-day helpers (TASK-685)', () => {
  it('names the Kyiv day of an instant, not the UTC one', () => {
    // 22:30 UTC on 31 August is 01:30 on 1 September in Kyiv.
    expect(kyivDateOf(new Date('2026-08-31T22:30:00.000Z'))).toBe('2026-09-01');
    expect(kyivDateOf(new Date('2026-08-31T20:59:59.999Z'))).toBe('2026-08-31');
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('counts days inclusively', () => {
    expect(daysInclusive('2026-09-01', '2026-09-01')).toBe(1);
    expect(daysInclusive('2026-08-01', '2026-08-31')).toBe(31);
    // A DST switch inside the range must not shave or add a day.
    expect(daysInclusive('2026-03-28', '2026-03-30')).toBe(3);
  });

  it('finds month bounds', () => {
    expect(monthStart('2026-09-26')).toBe('2026-09-01');
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
    expect(monthEnd('2028-02-10')).toBe('2028-02-29');
    expect(monthEnd('2026-12-05')).toBe('2026-12-31');
  });

  it('accepts only real YYYY-MM-DD days', () => {
    expect(isCalendarDay('2026-09-26')).toBe(true);
    expect(isCalendarDay('2026-02-30')).toBe(false);
    expect(isCalendarDay('2026-9-26')).toBe(false);
    expect(isCalendarDay('2026-09-26T00:00:00Z')).toBe(false);
  });

  it('buckets in SQL as the UTC-stored column shown in Kyiv', () => {
    const sql = kyivDaySql(Prisma.raw('o.created_at'));
    expect(sql.sql).toBe("((o.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Kyiv')::date");
    // No bound values: the expression must be textually identical in SELECT and GROUP BY.
    expect(sql.values).toEqual([]);
  });
});
