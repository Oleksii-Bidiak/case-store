import { productControllerFindAll } from "@/shared/api/generated/products/products";
import type { ProductEntity } from "@/shared/api/generated/models";

const PAGE_SIZE = 200;

/**
 * Fetch every ACTIVE product across all pages using the Orval plain fetcher
 * (server-only — NOT a React hook). Used by app/sitemap.ts.
 *
 * Throws on HTTP error; the caller (sitemap) wraps this in try/catch and falls
 * back to static routes so a sitemap fetch failure never breaks the route.
 */
export async function fetchAllActiveProducts(): Promise<ProductEntity[]> {
  const first = await productControllerFindAll({
    isActive: true,
    page: 1,
    limit: PAGE_SIZE,
  });

  const products: ProductEntity[] = [...first.data];
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
