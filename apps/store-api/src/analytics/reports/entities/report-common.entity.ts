import { ApiProperty } from '@nestjs/swagger';
import { ReportPeriod, ReportPreset, REPORT_PRESETS } from '../report-period';

/**
 * The two ranges a report answered for (TASK-685). Calendar days only — the
 * instants stay on the server, where they were computed; the screen needs the
 * days to label the comparison and to name the CSV file.
 */
export class ReportPeriodEntity {
  @ApiProperty({ enum: REPORT_PRESETS, enumName: 'ReportPreset' })
  preset!: ReportPreset;

  @ApiProperty({ description: 'First Kyiv day, included', example: '2026-08-01' })
  from!: string;

  @ApiProperty({ description: 'Last Kyiv day, included', example: '2026-08-31' })
  to!: string;

  @ApiProperty({ description: 'Days in the period', example: 31 })
  days!: number;

  @ApiProperty({ description: 'First day of the comparison range', example: '2026-07-01' })
  previousFrom!: string;

  @ApiProperty({ description: 'Last day of the comparison range', example: '2026-07-31' })
  previousTo!: string;

  @ApiProperty({ description: 'Days in the comparison range', example: 31 })
  previousDays!: number;

  static from(period: ReportPeriod): ReportPeriodEntity {
    return {
      preset: period.preset,
      from: period.current.fromDay,
      to: period.current.toDay,
      days: period.current.days,
      previousFrom: period.previous.fromDay,
      previousTo: period.previous.toDay,
      previousDays: period.previous.days,
    };
  }
}

/**
 * One number with its comparison (plan 188: "comparison always").
 *
 * `changePct` is the relative change in percent, one decimal, against the
 * magnitude of `previous` (so a net that went from −100 to +100 reads +200%,
 * not −200%). It is `null` when `previous` is 0: "+∞%" is not a number an
 * operator can act on, and 0% would be a lie.
 */
export class ComparedValueEntity {
  @ApiProperty({ example: 42000 })
  current!: number;

  @ApiProperty({ example: 38000 })
  previous!: number;

  @ApiProperty({
    description: 'Change against `previous`, in percent (one decimal); null when previous is 0',
    type: Number,
    nullable: true,
    example: 10.5,
  })
  changePct!: number | null;

  static of(current: number, previous: number): ComparedValueEntity {
    const changePct =
      previous === 0 ? null : Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
    return { current, previous, changePct };
  }
}

/** Money is summed as `Decimal(10,2)` in SQL and arrives as float; keep kopecks exact. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A point of a daily series (Kyiv calendar day). */
export class DailyValueEntity {
  @ApiProperty({ description: 'Kyiv calendar day', example: '2026-08-01' })
  date!: string;

  @ApiProperty({ example: 1200 })
  value!: number;
}
