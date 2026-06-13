/**
 * Build a Schema.org Organization JSON-LD graph for the storefront brand.
 * Pure function — no React, routing, or API dependency (unit-testable).
 */
export function buildOrganizationSchema(
  siteUrl: string,
  siteName: string,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteName,
    url: siteUrl,
  };
}
