import { ReorderFlatDto } from '../../common/dto';

/**
 * Body of `PATCH /api/admin/home-blocks/reorder` (TASK-661): the COMPLETE, final order
 * of the homepage, every block of every status. The index becomes `sortOrder`. A
 * partial list is a 409 (someone added a block underneath you) — the shared flat
 * reorder contract of `common/reorder`.
 */
export class ReorderHomeBlocksDto extends ReorderFlatDto {}
