/**
 * Build a Schema.org Organization JSON-LD graph for the storefront brand.
 *
 * `sameAs` links the brand entity to its social profiles (Viber / Telegram /
 * Instagram from the admin-managed contact settings) — the strongest on-page
 * signal AI search engines use to recognize a brand as an entity. Empty/blank
 * links are dropped, and `sameAs` is omitted entirely when none are configured.
 *
 * `logo` is the admin-uploaded store logo (`SeoSettings.logoUrl`, TASK-299) —
 * Google documents it as a recommended Organization property (it feeds the
 * knowledge panel / merchant listings). It is emitted as an ABSOLUTE URL:
 * store-api already returns one, but a relative `/uploads/...` path is resolved
 * against `siteUrl` rather than shipped as-is, because a relative `logo` value is
 * useless to a crawler. Omitted entirely when no logo is set.
 *
 * `contactPoint` (TASK-556) is the customer-service phone/email from the
 * admin-managed `SiteContactSettings` — the same values the footer and `/contact`
 * print, so the entity Google builds and the page a person reads cannot
 * disagree. Omitted when neither is set. `address` is NOT emitted: the settings
 * have no address column yet (its own BACKLOG row), and a placeholder address
 * in structured data would be a false statement about the business.
 *
 * Pure function — no React, routing, or API dependency (unit-testable).
 */
export function buildOrganizationSchema(
  siteUrl: string,
  siteName: string,
  sameAs: readonly (string | null | undefined)[] = [],
  logoUrl?: string | null,
  contact?: { phone?: string | null; email?: string | null } | null,
): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteName,
    url: siteUrl,
  };

  const logo = absolutize(logoUrl, siteUrl);
  if (logo) {
    schema.logo = logo;
  }

  const links = sameAs.filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0,
  );
  if (links.length > 0) {
    schema.sameAs = links;
  }

  const telephone = contact?.phone?.trim();
  const email = contact?.email?.trim();
  if (telephone || email) {
    schema.contactPoint = {
      "@type": "ContactPoint",
      contactType: "customer service",
      ...(telephone ? { telephone } : {}),
      ...(email ? { email } : {}),
      areaServed: "UA",
      availableLanguage: ["uk"],
    };
  }

  return schema;
}

/** Absolute URLs pass through; a site-relative path is joined onto `siteUrl`. */
function absolutize(
  url: string | null | undefined,
  siteUrl: string,
): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;

  try {
    return new URL(trimmed, siteUrl).toString();
  } catch {
    return undefined;
  }
}
