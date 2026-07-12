import { ReorderTreeDto } from '../../common/dto';

/**
 * Body of `PATCH /api/admin/categories/reorder` (TASK-291, plan 158 §3.4 / §6).
 *
 * A named, category-bound alias of the shared {@link ReorderTreeDto} — the contract is
 * identical (that is the point of hoisting it), but the endpoint keeps its own DTO class
 * so Swagger/Orval name the generated model after the resource, and so a
 * category-specific constraint can be added later without touching the shared shape.
 */
export class ReorderCategoriesDto extends ReorderTreeDto {}
