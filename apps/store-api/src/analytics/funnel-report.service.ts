import { Injectable } from '@nestjs/common';
import { PeriodQueryDto } from './reports/dto/period-query.dto';
import { ComparedValueEntity, ReportPeriodEntity } from './reports/entities/report-common.entity';
import { ReportCache } from './reports/report-cache';
import { ReportRange, resolveReportPeriod } from './reports/report-period';
import {
  FUNNEL_EVENTS,
  FunnelEvent,
  FunnelReportEntity,
  FunnelTransitionEntity,
} from './entities/funnel-report.entity';
import { UmamiClient } from './umami.client';

/** Shares are shown as percentages; four decimals of a 0…1 ratio is 0.01%. */
function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 10_000) / 10_000;
}

/**
 * «Відвідуваність і воронка» (TASK-689, plan 188).
 *
 * Lives in the analytics module beside the traffic summary because it is the
 * same kind of thing — a view of Umami, with no table of ours behind it — and
 * shares its client (one login token). The period and the cache are the
 * reports' own, so "August" is the same Kyiv August on every card.
 *
 * Only an answered funnel is cached. "Umami did not answer" is a transient
 * state; cached, a one-request blip would read as a five-minute outage.
 */
@Injectable()
export class FunnelReportService {
  constructor(
    private readonly umami: UmamiClient,
    private readonly reportCache: ReportCache,
  ) {}

  async getFunnelReport(
    query: PeriodQueryDto,
    now: Date = new Date(),
  ): Promise<FunnelReportEntity> {
    const period = resolveReportPeriod(query, now);
    const periodEntity = ReportPeriodEntity.from(period);

    if (!this.umami.isConfigured()) {
      return unknown(periodEntity, false);
    }

    return this.reportCache.getOrCompute(
      { report: 'funnel', period, hasRevenue: false },
      async () => {
        const [current, previous] = await Promise.all([
          this.eventCounts(period.current),
          this.eventCounts(period.previous),
        ]);
        if (current === null || previous === null) return unknown(periodEntity, true);

        const count = (counts: Record<string, number>, event: FunnelEvent) => counts[event] ?? 0;
        const transitions: FunnelTransitionEntity[] = [];
        for (let i = 1; i < FUNNEL_EVENTS.length; i += 1) {
          const from = FUNNEL_EVENTS[i - 1];
          const to = FUNNEL_EVENTS[i];
          transitions.push({
            from,
            to,
            rate: ratio(count(current, to), count(current, from)),
            previousRate: ratio(count(previous, to), count(previous, from)),
          });
        }

        return {
          period: periodEntity,
          configured: true,
          available: true,
          steps: FUNNEL_EVENTS.map((event) => ({
            event,
            count: ComparedValueEntity.of(count(current, event), count(previous, event)),
          })),
          transitions,
          conversion: ratio(count(current, 'purchase'), count(current, 'add_to_cart')),
          previousConversion: ratio(count(previous, 'purchase'), count(previous, 'add_to_cart')),
        };
      },
      (answer) => answer.available,
    );
  }

  /** Umami takes an inclusive window in epoch ms; our ranges are half-open. */
  private eventCounts(range: ReportRange): Promise<Record<string, number> | null> {
    return this.umami.getEventCounts(range.start.getTime(), range.end.getTime() - 1);
  }
}

/** Not configured, or configured and silent: the period, the state, and nulls — never zeros. */
function unknown(period: ReportPeriodEntity, configured: boolean): FunnelReportEntity {
  return {
    period,
    configured,
    available: false,
    steps: null,
    transitions: null,
    conversion: null,
    previousConversion: null,
  };
}
