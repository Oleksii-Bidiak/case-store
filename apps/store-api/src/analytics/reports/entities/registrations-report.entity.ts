import { ApiProperty } from '@nestjs/swagger';
import { ReportPeriod } from '../report-period';
import type { RegistrationDay, RegistrationTotals } from '../registrations.repository';
import { ComparedValueEntity, ReportPeriodEntity } from './report-common.entity';

/** One Kyiv day of the registrations series (TASK-690). */
export class RegistrationDayEntity {
  @ApiProperty({ description: 'Kyiv calendar day', example: '2026-08-01' })
  date!: string;

  @ApiProperty({ description: 'New customer accounts that day', example: 3 })
  registrations!: number;
}

/**
 * «Реєстрації» (TASK-690, plan 188): new customer accounts in the period with
 * the comparison, the share that had ordered as a guest first, and the daily
 * series. No money in it, so it is served under `analytics:read` whole.
 */
export class RegistrationsReportEntity {
  @ApiProperty({ type: ReportPeriodEntity })
  period!: ReportPeriodEntity;

  @ApiProperty({ type: ComparedValueEntity, description: 'New customer accounts' })
  registrations!: ComparedValueEntity;

  @ApiProperty({
    type: ComparedValueEntity,
    description: 'Of those, accounts whose email had placed a guest order before registering',
  })
  fromGuest!: ComparedValueEntity;

  @ApiProperty({
    type: [RegistrationDayEntity],
    description: 'One point per Kyiv day of the period, first to last; empty days are zeros',
  })
  daily!: RegistrationDayEntity[];

  static from(
    period: ReportPeriod,
    current: RegistrationTotals,
    previous: RegistrationTotals,
    daily: RegistrationDay[],
  ): RegistrationsReportEntity {
    return {
      period: ReportPeriodEntity.from(period),
      registrations: ComparedValueEntity.of(current.registrations, previous.registrations),
      fromGuest: ComparedValueEntity.of(current.fromGuest, previous.fromGuest),
      daily: daily.map(({ date, registrations }) => ({ date, registrations })),
    };
  }
}
