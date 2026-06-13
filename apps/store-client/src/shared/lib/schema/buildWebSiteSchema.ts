/**
 * Build a Schema.org WebSite JSON-LD graph with a SearchAction so search engines
 * can surface a sitelinks search box pointing at the product list search.
 * Pure function — unit-testable.
 */
export function buildWebSiteSchema(
  siteUrl: string,
  siteName: string,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/products?search={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}
