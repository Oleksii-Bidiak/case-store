import { ReorderFlatDto } from '../../common/dto';

/**
 * Body of `PATCH /api/categories/:categoryId/attribute-definitions/reorder` (TASK-298).
 *
 * A named, definition-bound alias of the shared {@link ReorderFlatDto} — the contract is now
 * identical to banners / blog categories / device brands (that is the point of hoisting it),
 * but the endpoint keeps its own DTO class so Swagger/Orval name the generated model after
 * the resource (precedent: `ReorderBlogCategoriesDto`).
 *
 * The bucket key is NOT carried in the body: a definition's `sortOrder` is only meaningful
 * inside its OWNING CATEGORY, and that category is already the route param — it is both the
 * advisory-lock bucket and the WHERE scope of every write. A definition never moves between
 * categories (`UpdateAttributeDefinitionInput` deliberately omits `categoryId`).
 *
 * `@ArrayNotEmpty` is deliberately GONE (it was here before TASK-298): an empty `orderedIds`
 * is legal exactly when the bucket is empty too, and the authoritative in-transaction check
 * (`assertFlatReorder`) is what enforces that — a partial payload is a 409, not a 400.
 */
export class ReorderAttributeDefinitionsDto extends ReorderFlatDto {}
