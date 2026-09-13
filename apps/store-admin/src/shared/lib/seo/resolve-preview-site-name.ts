import { dict } from "@/shared/config";

/** The one field of the SeoSettings singleton this helper reads. */
export interface ResolvePreviewSiteNameSettings {
  siteName?: string | null;
}

/**
 * The store name the SERP preview must brand titles with (TASK-433).
 *
 * MIRRORS the storefront's `resolveSiteName()`
 * (`apps/store-client/src/shared/lib/seo/resolve-site-name.ts`), including its
 * fallback rule: a blank or whitespace-only `siteName` means "give me the
 * default back", not an empty brand.
 *
 * It exists because the preview is the owner's ONLY feedback loop for what the
 * `<title>` will say, and after TASK-433 the two sides had diverged: the
 * storefront started reading the admin-managed `SeoSettings.siteName` while the
 * four content forms still branded with the `dict.brand` constant. Rename the
 * shop and every product/category/page/post preview kept promising the old name.
 *
 * `dict.brand` stays as the fallback — it is the admin's copy of the same
 * `SITE_NAME` constant the storefront falls back to.
 */
export function resolvePreviewSiteName(
  settings?: ResolvePreviewSiteNameSettings | null,
): string {
  return (settings?.siteName ?? "").trim() || dict.brand;
}
