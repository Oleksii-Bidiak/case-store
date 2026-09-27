import { buildItemListSchema } from "./buildItemListSchema";

/** The product fields an ItemList entry reads — any listing entity has them. */
export interface ItemListProduct {
  name: string;
  slug: string;
  primaryImage?: { url: string } | null;
}

/**
 * ItemList JSON-LD for a page of products (TASK-556 tail, TASK-563): one entry
 * per product, pointing at its canonical PDP. Returns `null` for an empty page —
 * an ItemList with no items is noise a validator flags, not a signal.
 *
 * The listing routes (`/products`, `/categories/[slug]`, `/promo`) build it
 * from the SAME server prefetch that fills the grid, so the structured data and
 * the visible cards can never list different products.
 */
export function buildProductItemListSchema(
  products: ItemListProduct[] | undefined,
  siteUrl: string,
): Record<string, unknown> | null {
  if (!products || products.length === 0) return null;
  return buildItemListSchema(
    products.map((product) => ({
      name: product.name,
      url: `${siteUrl}/products/${product.slug}`,
      image: product.primaryImage?.url,
    })),
  );
}
