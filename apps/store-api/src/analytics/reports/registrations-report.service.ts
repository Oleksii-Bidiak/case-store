import { Injectable } from '@nestjs/common';
import { PeriodQueryDto } from './dto/period-query.dto';
import { RegistrationsReportEntity } from './entities/registrations-report.entity';
import { RegistrationsRepository } from './registrations.repository';
import { ReportCache } from './report-cache';
import { resolveReportPeriod } from './report-period';

/**
 * «Реєстрації» (TASK-690, plan 188) — the cheapest report of the five, in the
 * set because the owner chose it explicitly. Counts only, so the cache key's
 * money flag is always `false`: every actor who may open it gets the same
 * answer.
 */
@Injectable()
export class RegistrationsReportService {
  constructor(
    private readonly registrationsRepository: RegistrationsRepository,
    private readonly reportCache: ReportCache,
  ) {}

  async getRegistrationsReport(
    query: PeriodQueryDto,
    now: Date = new Date(),
  ): Promise<RegistrationsReportEntity> {
    const period = resolveReportPeriod(query, now);

    return this.reportCache.getOrCompute(
      { report: 'registrations', period, hasRevenue: false },
      async () => {
        const [current, previous, daily] = await Promise.all([
          this.registrationsRepository.getTotals(period.current),
          this.registrationsRepository.getTotals(period.previous),
          this.registrationsRepository.getDaily(period.current),
        ]);
        return RegistrationsReportEntity.from(period, current, previous, daily);
      },
    );
  }
}
