import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { REPORT_PRESETS, ReportPreset } from '../report-period';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The period every `/analytics` report takes (TASK-685).
 *
 * Shape only — whether the range can be answered (a real date, `from ≤ to`,
 * not in the future, at most 366 days) is decided by `resolveReportPeriod`,
 * which is also what the dashboard calls, so the rule lives in one place.
 */
export class PeriodQueryDto {
  @ApiProperty({
    description:
      'Period preset. Rolling presets and `custom` are compared with the equal run of days right ' +
      'before; `this-month` (1…N) with days 1…N of the previous month; `last-month` with the ' +
      'whole month before it. Days are Kyiv calendar days, today included.',
    enum: REPORT_PRESETS,
    enumName: 'ReportPreset',
    required: false,
    default: '30d',
  })
  @IsOptional()
  @IsIn(REPORT_PRESETS, { message: `preset must be one of: ${REPORT_PRESETS.join(', ')}` })
  preset?: ReportPreset;

  @ApiProperty({
    description: 'First Kyiv day, included (`custom` only)',
    required: false,
    example: '2026-08-01',
  })
  @IsOptional()
  @Matches(DAY_PATTERN, { message: 'from must be a day in YYYY-MM-DD form' })
  from?: string;

  @ApiProperty({
    description: 'Last Kyiv day, included (`custom` only)',
    required: false,
    example: '2026-08-31',
  })
  @IsOptional()
  @Matches(DAY_PATTERN, { message: 'to must be a day in YYYY-MM-DD form' })
  to?: string;
}
