import { productControllerFindAll } from "@/shared/api/generated/products/products";
import type { PublicProductEntity } from "@/shared/api/generated/models";

// Must not exceed the API's max `limit` (100) — a larger value makes the very
// first page request fail with 400 "Limit must be at most 100", which would
// throw out of fetchAllActiveProducts and collapse the sitemap to static-only.
const PAGE_SIZE = 100;

/**
 * Fetch every ACTIVE product across all pages using the Orval plain fetcher
 * (server-only — NOT a React hook). Used by app/sitemap.ts.
 *
 * Throws on HTTP error; the caller (sitemap) wraps this in try/catch and falls
 * back to static routes so a sitemap fetch failure never breaks the route.
 */
export async function fetchAllActiveProducts(): Promise<PublicProductEntity[]> {
  const first = await productControllerFindAll({
    isActive: true,
    page: 1,
    limit: PAGE_SIZE,
  });

  const products: PublicProductEntity[] = [...first.data];
  const totalPages = first.meta.totalPages;

  for (let page = 2; page <= totalPages; page++) {
    const next = await productControllerFindAll({
      isActive: true,
      page,
      limit: PAGE_SIZE,
    });
    products.push(...next.data);
  }

  return products;
}
