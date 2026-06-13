/** A single breadcrumb trail entry (label + absolute URL). */
export interface BreadcrumbItem {
  name: string;
  item: string;
}

/**
 * Build a Schema.org BreadcrumbList JSON-LD graph. Positions are 1-based and
 * follow the order of the input array. Pure function — unit-testable.
 */
export function buildBreadcrumbSchema(
  items: BreadcrumbItem[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: entry.item,
    })),
  };
}
