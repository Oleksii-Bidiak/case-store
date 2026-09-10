import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsUUID } from 'class-validator';
import { MAX_REORDER_IDS } from '../../common/dto';

/**
 * Body of `PATCH /api/admin/categories/status` (TASK-293).
 *
 * Sets `isActive` on the named categories and nothing else — NO CASCADE to descendants
 * (owner decision): the operation is the per-row status toggle applied to N rows.
 *
 * The id cap is the same {@link MAX_REORDER_IDS} the reorder endpoint uses — both are
 * bounded batch writes over the same table, and there is no reason for an admin to select
 * more categories at once than they can reorder.
 */
export class BulkCategoryStatusDto {
  @ApiProperty({
    description: 'Ids of the categories whose status is being set.',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_REORDER_IDS)
  @IsUUID('all', { each: true })
  ids!: string[];

  @ApiProperty({
    description:
      'The status to write: `true` activates every listed category, `false` deactivates.',
  })
  @IsBoolean()
  isActive!: boolean;
}
