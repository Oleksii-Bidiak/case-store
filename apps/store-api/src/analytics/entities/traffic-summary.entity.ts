import { ApiProperty } from '@nestjs/swagger';
import { UmamiStatsRaw } from '../umami.client';

/**
 * Traffic summary for the admin dashboard (TASK-380).
 *
 * Carries THREE distinguishable states rather than a bare set of numbers,
 * because on a dashboard tile "nobody visited" and "we could not ask" look the
 * same and mean the opposite:
 *
 * - `configured: false` — analytics was never wired up. The card shows its
 *   existing link/muted state; nothing is broken.
 * - `configured: true, available: false` — Umami is set up but did not answer.
 *   The card says so instead of drawing zeroes.
 * - `configured: true, available: true` — the metrics are real.
 */
export class TrafficSummaryEntity {
  @ApiProperty({ description: 'Analytics credentials are present on the server' })
  configured!: boolean;

  @ApiProperty({ description: 'The analytics service answered this request' })
  available!: boolean;

  @ApiProperty({ description: 'Length of the reported window, in days', example: 7 })
  rangeDays!: number;

  // `type: Number` is load-bearing on every nullable field below: without it the
  // emitted schema has no type at all, and Orval generates
  // `{ [key: string]: unknown } | null` — which type-checks against nothing the
  // admin card wants to do with a number.
  @ApiProperty({
    description: 'Page views in the window',
    type: Number,
    nullable: true,
    example: 1240,
  })
  pageviews!: number | null;

  @ApiProperty({
    description: 'Unique visitors in the window',
    type: Number,
    nullable: true,
    example: 380,
  })
  visitors!: number | null;

  @ApiProperty({
    description: 'Sessions in the window',
    type: Number,
    nullable: true,
    example: 460,
  })
  visits!: number | null;

  @ApiProperty({
    description: 'Share of single-page sessions, 0…1',
    type: Number,
    nullable: true,
    example: 0.42,
  })
  bounceRate!: number | null;

  @ApiProperty({
    description: 'Average session length in seconds',
    type: Number,
    nullable: true,
    example: 96,
  })
  avgVisitSeconds!: number | null;

  @ApiProperty({
    description: 'Visitors in the PREVIOUS window of equal length, for comparison',
    type: Number,
    nullable: true,
    example: 351,
  })
  previousVisitors!: number | null;

  /** Nothing configured — the honest empty state. */
  static notConfigured(rangeDays: number): TrafficSummaryEntity {
    return TrafficSummaryEntity.empty(rangeDays, false);
  }

  /** Configured but the service did not answer. */
  static unavailable(rangeDays: number): TrafficSummaryEntity {
    return TrafficSummaryEntity.empty(rangeDays, true);
  }

  static fromUmami(stats: UmamiStatsRaw, rangeDays: number): TrafficSummaryEntity {
    const entity = new TrafficSummaryEntity();
    entity.configured = true;
    entity.available = true;
    entity.rangeDays = rangeDays;
    entity.pageviews = stats.pageviews?.value ?? 0;
    entity.visitors = stats.visitors?.value ?? 0;
    entity.visits = stats.visits?.value ?? 0;
    entity.previousVisitors = stats.visitors?.prev ?? null;

    // Both derived metrics divide by visits, and a window with no traffic at all
    // is the normal state of a brand-new shop — so guard rather than emit NaN,
    // which serialises to `null` in JSON and would read as "unavailable".
    const visits = entity.visits ?? 0;
    entity.bounceRate = visits > 0 ? (stats.bounces?.value ?? 0) / visits : null;
    entity.avgVisitSeconds = visits > 0 ? Math.round((stats.totaltime?.value ?? 0) / visits) : null;
    return entity;
  }

  private static empty(rangeDays: number, configured: boolean): TrafficSummaryEntity {
    const entity = new TrafficSummaryEntity();
    entity.configured = configured;
    entity.available = false;
    entity.rangeDays = rangeDays;
    entity.pageviews = null;
    entity.visitors = null;
    entity.visits = null;
    entity.bounceRate = null;
    entity.avgVisitSeconds = null;
    entity.previousVisitors = null;
    return entity;
  }
}
