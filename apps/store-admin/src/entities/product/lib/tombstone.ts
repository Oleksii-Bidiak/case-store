/**
 * A deleted product's own address and артикул (TASK-656).
 *
 * A soft delete (`ProductService.delete`, TASK-427) frees the unique slots by
 * rewriting `slug` and `sku` to `deleted:<id>:<value>`, and the admin list of
 * deleted products returns them that way. The operator never typed that
 * string: the deleted view and the restore dialog show the value the product
 * HAD — which is also what `POST /products/:id/restore` tries to give back.
 *
 * Only the EXACT prefix of this product is removed, mirroring the API's
 * `stripTombstonePrefix`: never `split(":")`, because a native value may itself
 * contain a colon. A value without the prefix is returned untouched.
 */
export function tombstonePrefix(productId: string): string {
  return `deleted:${productId}:`;
}

export function stripTombstonePrefix(value: string, productId: string): string;
export function stripTombstonePrefix(
  value: string | null | undefined,
  productId: string,
): string | null;
export function stripTombstonePrefix(
  value: string | null | undefined,
  productId: string,
): string | null {
  if (value === null || value === undefined) return null;
  const prefix = tombstonePrefix(productId);
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}
