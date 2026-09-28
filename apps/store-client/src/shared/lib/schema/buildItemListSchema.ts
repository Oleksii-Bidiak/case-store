/** A single entry for an ItemList (name + absolute URL + optional image). */
export interface ItemListEntry {
  name: string;
  url: string;
  image?: string;
}

/**
 * What the listed things are. `Product` for catalogue listings (the default —
 * every original caller), `BlogPosting` for the `/blog` hub (TASK-556), whose
 * entries carry the article title as `headline`, the property Google reads on
 * an article.
 */
export type ItemListItemType = "Product" | "BlogPosting";

/**
 * Build a Schema.org ItemList JSON-LD graph for a listing page. Positions are
 * 1-based and follow the order of the input array; `image` is omitted per-item
 * when absent. Pure function — unit-testable.
 */
export function buildItemListSchema(
  items: ItemListEntry[],
  options: { itemType?: ItemListItemType } = {},
): Record<string, unknown> {
  const itemType = options.itemType ?? "Product";
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": itemType,
        ...(itemType === "BlogPosting"
          ? { headline: entry.name }
          : { name: entry.name }),
        url: entry.url,
        ...(entry.image ? { image: entry.image } : {}),
      },
    })),
  };
}
