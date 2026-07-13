import { ReorderFlatDto } from '../../common/dto';

/**
 * Body of `PATCH /api/admin/blog/categories/reorder` (TASK-295).
 *
 * A named, blog-bound alias of the shared {@link ReorderFlatDto} — the contract is
 * identical (that is the point of hoisting it), but the endpoint keeps its own DTO class so
 * Swagger/Orval name the generated model after the resource (precedent:
 * `ReorderCategoriesDto`), and so a blog-specific constraint can be added later without
 * touching the shared shape.
 *
 * Blog categories are a SINGLE global list — there is no bucket key to carry.
 */
export class ReorderBlogCategoriesDto extends ReorderFlatDto {}
