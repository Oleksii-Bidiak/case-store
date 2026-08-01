import { Injectable } from '@nestjs/common';
import { UmamiClient } from './umami.client';
import { TrafficSummaryEntity } from './entities/traffic-summary.entity';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * AnalyticsService — turns the analytics vendor's raw metrics into the summary
 * the admin dashboard renders (TASK-380).
 *
 * Deliberately thin and vendor-shaped-in-one-place: the controller never sees
 * Umami's field names, so replacing the provider means rewriting the client and
 * this mapping, not the API contract or the admin UI.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly umami: UmamiClient) {}

  /**
   * Traffic for the last `days` days, ending now. Never throws: an unconfigured
   * or unreachable analytics service produces an entity that says so.
   */
  async getTrafficSummary(days: number): Promise<TrafficSummaryEntity> {
    if (!this.umami.isConfigured()) return TrafficSummaryEntity.notConfigured(days);

    const endAt = Date.now();
    const startAt = endAt - days * MS_PER_DAY;
    const stats = await this.umami.getStats(startAt, endAt);
    if (!stats) return TrafficSummaryEntity.unavailable(days);

    return TrafficSummaryEntity.fromUmami(stats, days);
  }
}
