import { permanentRedirect } from "next/navigation";

type CatalogIndexPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * `/catalog` with no segments — a safety net, not a page (TASK-836).
 *
 * The storefront has never served a bare `/catalog`: the catalogue is
 * `/products`, and `/catalog/…` exists only as the two-segment compatibility
 * landing `/catalog/[category]/[device]`. But the first seed wrote banner CTAs
 * as `/catalog` and `/catalog?sale=true`, databases seeded from it kept them,
 * and `next/link` prefetches every banner href — so the demo's production
 * console filled with `GET /catalog?_rsc=… 404` on every home-page load
 * (SF-UX-13).
 *
 * The data is fixed by the `banner_cta_catalog_paths` migration and the admin
 * placeholder no longer suggests the dead path. This route catches whatever
 * the migration cannot know about — a CTA typed by hand, an old bookmark, a
 * link in a sent newsletter — with a 308 to where the shopper meant to go:
 *   - `?sale=true` → `/promo`, the deals landing (what the banner promised);
 *   - anything else → `/products`, query string carried over, so a
 *     `?category=<slug>` still narrows the listing.
 */
export default async function CatalogIndexPage({
  searchParams,
}: CatalogIndexPageProps) {
  const params = await searchParams;

  const sale = params.sale;
  if ((Array.isArray(sale) ? sale[0] : sale) === "true") {
    permanentRedirect("/promo");
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      query.append(key, entry);
    }
  }
  const serialized = query.toString();
  permanentRedirect(serialized ? `/products?${serialized}` : "/products");
}
