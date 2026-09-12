import { SITE_NAME } from "@/shared/config";

/** The one field of the SeoSettings singleton this helper reads. */
export interface ResolveSiteNameSettings {
  siteName?: string | null;
}

/**
 * The store's display name, resolved in ONE place (TASK-433).
 *
 * Before this helper the name lived only in the `SITE_NAME` constant, so
 * renaming the shop meant a code change and a redeploy — and the name appears on
 * more surfaces than anyone reliably remembers: the `<title>` template,
 * `og:site_name`, Organization / WebSite / BlogPosting JSON-LD, `/llms.txt`, the
 * web manifest and the Google Merchant feed. The admin-managed
 * `SeoSettings.siteName` is now the source of truth and every SERVER-rendered
 * surface reads it through this function.
 *
 * `SITE_NAME` remains as the zero-config fallback: the column is nullable, the
 * settings fetch returns null when the API is unreachable, and neither case may
 * render a nameless title. A blank or whitespace-only value falls back too — an
 * owner who clears the field wants the default back, not an empty `og:site_name`.
 *
 * NOT used by `shared/ui/logo.tsx`: the header/footer logo is a client component
 * with no access to the server fetch, so the lettering inside it still comes from
 * the constant. Moving it over is a separate task (see `docs/admin-guide.md`
 * «Де міняти назву магазину»), and the form hint in the admin says so out loud.
 */
export function resolveSiteName(
  settings?: ResolveSiteNameSettings | null,
): string {
  const name = settings?.siteName?.trim();
  return name || SITE_NAME;
}
