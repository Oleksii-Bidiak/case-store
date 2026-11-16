import { ApiProperty } from '@nestjs/swagger';
import { MoneyEntryKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PeriodQueryDto } from './period-query.dto';

export const DEFAULT_MONEY_FLOW_ENTRIES_LIMIT = 50;
/** One register page an accountant can scroll and export; more is a second request. */
export const MAX_MONEY_FLOW_ENTRIES_LIMIT = 500;
/**
 * Upper page bound: `(page − 1) × limit` is Prisma's `skip`, a 32-bit int —
 * an unbounded page overflows it into a 500. 100 000 × 500 stays far below 2^31.
 */
export const MAX_MONEY_FLOW_ENTRIES_PAGE = 100_000;

/**
 * The «Рух коштів» register's query (TASK-2395): the period of every report,
 * an optional ledger kind (a click on a breakdown row) and the page.
 */
export class MoneyFlowEntriesQueryDto extends PeriodQueryDto {
  @ApiProperty({
    description: 'Only entries of this ledger kind',
    enum: MoneyEntryKind,
    enumName: 'MoneyEntryKind',
    required: false,
  })
  @IsOptional()
  @IsEnum(MoneyEntryKind, {
    message: `kind must be one of: ${Object.values(MoneyEntryKind).join(', ')}`,
  })
  kind?: MoneyEntryKind;

  @ApiProperty({
    description: 'Page, from 1',
    required: false,
    minimum: 1,
    maximum: MAX_MONEY_FLOW_ENTRIES_PAGE,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_MONEY_FLOW_ENTRIES_PAGE, {
    message: `page must not be greater than ${MAX_MONEY_FLOW_ENTRIES_PAGE}`,
  })
  page?: number = 1;

  @ApiProperty({
    description: 'Entries per page',
    required: false,
    minimum: 1,
    maximum: MAX_MONEY_FLOW_ENTRIES_LIMIT,
    default: DEFAULT_MONEY_FLOW_ENTRIES_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_MONEY_FLOW_ENTRIES_LIMIT)
  limit?: number = DEFAULT_MONEY_FLOW_ENTRIES_LIMIT;
}
