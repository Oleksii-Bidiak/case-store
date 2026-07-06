/**
 * Build a Schema.org Organization JSON-LD graph for the storefront brand.
 *
 * `sameAs` links the brand entity to its social profiles (Viber / Telegram /
 * Instagram from the admin-managed contact settings) — the strongest on-page
 * signal AI search engines use to recognize a brand as an entity. Empty/blank
 * links are dropped, and `sameAs` is omitted entirely when none are configured.
 *
 * Pure function — no React, routing, or API dependency (unit-testable).
 */
export function buildOrganizationSchema(
  siteUrl: string,
  siteName: string,
  sameAs: readonly (string | null | undefined)[] = [],
): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteName,
    url: siteUrl,
  };

  const links = sameAs.filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0,
  );
  if (links.length > 0) {
    schema.sameAs = links;
  }

  return schema;
}
