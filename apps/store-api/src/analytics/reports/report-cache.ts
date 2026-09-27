import { Injectable } from '@nestjs/common';
import { CacheService } from '../../cache';
import { ReportPeriod } from './report-period';

/** Every report the `/analytics` screen asks for (plan 188). */
export type ReportName =
  'sales' | 'categories' | 'brands' | 'products' | 'funnel' | 'registrations';

/** Five minutes — the plan-188 budget; aggregates over months need not be live. */
export const REPORT_CACHE_TTL_SECONDS = 300;

export const REPORT_CACHE_PREFIX = 'analytics:report:';

export interface ReportCacheKeyParts {
  report: ReportName;
  period: ReportPeriod;
  /** Whether the ASKING actor may see money — part of the key, see below. */
  hasRevenue: boolean;
  /** Report-specific inputs that change the answer (parent category, limit…). */
  extra?: string;
}

/**
 * The cache key of a report answer (TASK-685).
 *
 * `hasRevenue` is in the key on purpose and must stay there: the same report
 * for the same period is a DIFFERENT answer for someone without
 * `analytics:revenue` — the money fields are cut out of it. A key without the
 * right would hand the first caller's answer to the second, i.e. serve sums
 * from the cache to a person the API just refused them to.
 *
 * The comparison range is not in the key because it is a pure function of the
 * preset and the current range; the preset is, so that "this month" and a
 * custom range over the same days (which compare against different ranges)
 * never share an entry.
 */
export function reportCacheKey({ report, period, hasRevenue, extra }: ReportCacheKeyParts): string {
  const { preset, current } = period;
  const base = `${REPORT_CACHE_PREFIX}${report}:${preset}:${current.fromDay}:${current.toDay}:rev=${hasRevenue ? 1 : 0}`;
  return extra === undefined ? base : `${base}:${encodeURIComponent(extra)}`;
}

/**
 * Cache-aside for report answers. Values must be plain JSON (numbers, strings,
 * arrays) — the cache serialises, so a `Date` or `Decimal` would come back as
 * something else.
 */
@Injectable()
export class ReportCache {
  constructor(private readonly cache: CacheService) {}

  /**
   * Return the cached answer or compute, store and return it.
   *
   * `cacheable` lets a report refuse to store an answer that describes a
   * transient failure (Umami not answering): caching "unavailable" for five
   * minutes would turn a one-request blip into a five-minute outage.
   */
  async getOrCompute<T>(
    parts: ReportCacheKeyParts,
    compute: () => Promise<T>,
    cacheable: (value: T) => boolean = () => true,
  ): Promise<T> {
    const key = reportCacheKey(parts);
    const cached = await this.cache.get<T>(key);
    if (cached !== null) return cached;

    const value = await compute();
    if (cacheable(value)) {
      await this.cache.set(key, value, REPORT_CACHE_TTL_SECONDS);
    }
    return value;
  }
}
