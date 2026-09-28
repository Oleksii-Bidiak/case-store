import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PeriodQueryDto } from './period-query.dto';

export const DEFAULT_PRODUCTS_REPORT_LIMIT = 10;
export const MAX_PRODUCTS_REPORT_LIMIT = 50;

/** The leaders & outsiders report's query (TASK-688): the period plus the list length. */
export class ProductsReportQueryDto extends PeriodQueryDto {
  @ApiProperty({
    description: 'Rows in each list (leaders and outsiders)',
    required: false,
    minimum: 1,
    maximum: MAX_PRODUCTS_REPORT_LIMIT,
    default: DEFAULT_PRODUCTS_REPORT_LIMIT,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PRODUCTS_REPORT_LIMIT)
  limit?: number;
}
