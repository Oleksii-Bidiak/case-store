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
