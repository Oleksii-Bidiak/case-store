import { ReorderFlatDto } from '../../common/dto';

/**
 * Body of `PATCH /api/admin/pages/reorder` (TASK-428).
 *
 * Static pages are a SINGLE global list (the `/legal` hub renders them in one
 * sequence), so there is no bucket key to carry and the shared
 * {@link ReorderFlatDto} is the whole contract — a named alias, exactly as
 * `ReorderDeviceBrandsDto` is, so Swagger/Orval name the generated model after
 * the resource instead of making every flat payload structurally interchangeable.
 */
export class ReorderPagesDto extends ReorderFlatDto {}
