import { ReorderFlatDto } from '../../common/dto';

/**
 * Body of `PATCH /api/admin/faq/reorder` (TASK-428).
 *
 * FAQ items live in ONE global bucket — there is no placement, no category, no
 * parent — so the shared {@link ReorderFlatDto} is the whole contract and this
 * subclass adds nothing. It exists anyway, for the same reason
 * `ReorderDeviceBrandsDto` does: the generated OpenAPI schema (and therefore the
 * Orval hook's payload type) is named after the DTO class, and three endpoints
 * sharing one anonymous `ReorderFlatDto` schema would make a payload meant for
 * the FAQ list interchangeable, to the type checker, with one meant for pages.
 */
export class ReorderFaqItemsDto extends ReorderFlatDto {}
