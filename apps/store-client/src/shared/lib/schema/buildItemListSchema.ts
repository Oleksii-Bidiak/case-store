/** A single product entry for an ItemList (name + absolute URL + optional image). */
export interface ItemListEntry {
  name: string;
  url: string;
  image?: string;
}

/**
 * Build a Schema.org ItemList JSON-LD graph for a category landing page's
 * product listing. Positions are 1-based and follow the order of the input
 * array; `image` is omitted per-item when absent. Pure function — unit-testable.
 */
export function buildItemListSchema(
  items: ItemListEntry[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Product",
        name: entry.name,
        url: entry.url,
        ...(entry.image ? { image: entry.image } : {}),
      },
    })),
  };
}
