import { ReorderFlatDto } from '../../common/dto';

/**
 * Body of `PATCH /api/admin/carousels/reorder` (TASK-428).
 *
 * The carousel list is ONE global list since TASK-660: the `placement` bucket key this
 * DTO used to carry went away together with `Carousel.placement`, because where a
 * carousel shows on the homepage now belongs to the homepage block pointing at it.
 * `orderedIds` must name every carousel; the index becomes `sortOrder`.
 */
export class ReorderCarouselsDto extends ReorderFlatDto {}
