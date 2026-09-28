import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PeriodQueryDto } from './period-query.dto';

/**
 * The category report's query (TASK-687): the shared period plus the category
 * being expanded. Without `parentId` the report answers the root categories;
 * with it, the children of that category — the "expand on demand" of plan 188.
 */
export class CategoryReportQueryDto extends PeriodQueryDto {
  @ApiProperty({
    description: 'Expand this category: rows for its children (each summed over its subtree)',
    required: false,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('loose', { message: 'parentId must be a valid UUID' })
  parentId?: string;
}
