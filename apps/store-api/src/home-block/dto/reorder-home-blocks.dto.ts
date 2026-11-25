import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import { MAX_REORDER_IDS, ReorderFlatDto } from '../../common/dto';

/**
 * Body of `PATCH /api/admin/home-blocks/reorder` (TASK-661): the COMPLETE, final order
 * of the homepage, every block of every status. The index becomes `sortOrder`. A
 * partial list is a 409 (someone added a block underneath you) — the shared flat
 * reorder contract of `common/reorder`.
 *
 * `expectedIds` (TASK-2547, REQUIRED) — the page order the tab LOADED, before the drag. If
 * the saved order is no longer exactly that (another tab reordered, added or removed a
 * block), the request is 409 `REORDER_STALE` and nothing is written.
 */
export class ReorderHomeBlocksDto extends ReorderFlatDto {
  @ApiProperty({
    description:
      'The page order this tab loaded, before the drag (every block id, in order). If the ' +
      'saved order differs — another tab reordered, added or removed a block — the request ' +
      'is refused with 409 REORDER_STALE and nothing changes.',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(MAX_REORDER_IDS)
  @IsUUID('loose', { each: true })
  expectedIds!: string[];
}
