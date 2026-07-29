/**
 * Positions with stock at or below this level (but > 0) are considered low
 * stock. This threshold is shared between two consumers and must stay in sync:
 *
 *   - the public product contract (`PublicProductEntity.lowStock`), which the
 *     storefront uses to render an "only a few left" signal without ever
 *     exposing the raw stock count, and
 *   - the admin dashboard low-stock query (`dashboard.repository.ts`), which
 *     lists positions an admin should restock.
 *
 * It lives in the product module (rather than the dashboard) so the public
 * product entity does not have to depend on the dashboard layer.
 */
export const LOW_STOCK_THRESHOLD = 5;

/**
 * Max number of `isFilterable` specs surfaced as PDP highlights ("Коротко про
 * товар" grid, TASK-191). Keeps the strip compact regardless of how many
 * filterable definitions a category declares.
 */
export const MAX_HIGHLIGHTS = 4;

/**
 * Max accepted length of a product description, in characters (TASK-361).
 *
 * Raised from the original 5000 when the description became rich text: the
 * limit now counts MARKUP as well as prose, and a supplier catalogue row can
 * legitimately carry a long spec write-up (the reference import file has one
 * description of 12 259 characters). 5000 silently rejected real products.
 * Shared by the create and update DTOs so the two can never drift.
 */
export const MAX_DESCRIPTION_LENGTH = 20_000;
