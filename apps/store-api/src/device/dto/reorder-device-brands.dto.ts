import { ReorderFlatDto } from '../../common/dto';

/**
 * Body of `PATCH /api/admin/devices/brands/reorder` (TASK-295).
 *
 * A named, device-bound alias of the shared {@link ReorderFlatDto} — the contract is
 * identical, but the endpoint keeps its own DTO class so Swagger/Orval name the generated
 * model after the resource (precedent: `ReorderCategoriesDto`).
 *
 * Device brands are a SINGLE global list — there is no bucket key to carry.
 */
export class ReorderDeviceBrandsDto extends ReorderFlatDto {}
