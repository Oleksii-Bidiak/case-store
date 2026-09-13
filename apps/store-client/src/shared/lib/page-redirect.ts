import { fetchPublishedPageAnyKind } from "@/shared/api/pages-server";
import { pageCanonicalPath } from "@/shared/config";
import { resolveSlugRedirect } from "./slug-redirect";

/**
 * Where a dead `/legal/<slug>` or `/info/<slug>` request should be sent, or null
 * when it is a genuine 404.
 *
 * Two things can kill one of those URLs, and only one of them was handled
 * before:
 *
 *  1. **The slug was renamed.** Recorded in the `SlugRedirect` ledger by the API
 *     (TASK-285), which is what `resolveSlugRedirect` reads.
 *  2. **The page's KIND was changed.** `/legal/delivery` → `/info/delivery` is
 *     the same slug at a different address, so the ledger records nothing —
 *     `PageService.update` only writes a rename row when `dto.slug` differs.
 *     Before TASK-435 a page had exactly one address and this could not happen.
 *
 * Both are answered the same way: find the row (without narrowing by kind, since
 * the kind is the thing that may have changed) and ask where it lives now. The
 * kind-check also fixes a second-order bug in case 1 — the ledger is keyed by
 * ENTITY, not by route, so `/info/<a-renamed-legal-slug>` used to 308 to
 * `/info/<new-slug>`, an address that then 404s. Resolving through the row's own
 * kind turns that chain into the single honest 404 it always was.
 *
 * Never redirects to the address that was just requested: a self-redirect is an
 * infinite loop, and the caller only reaches here after that address missed.
 */
export async function resolvePageRedirect(
  slug: string,
  requestedPath: string,
): Promise<string | null> {
  const moved = await fetchPublishedPageAnyKind(slug);
  if (moved) {
    const target = pageCanonicalPath(moved.kind, moved.slug);
    return target && target !== requestedPath ? target : null;
  }

  const newSlug = await resolveSlugRedirect("PAGE", slug);
  if (!newSlug) return null;

  const renamed = await fetchPublishedPageAnyKind(newSlug);
  if (!renamed) return null;

  const target = pageCanonicalPath(renamed.kind, renamed.slug);
  return target && target !== requestedPath ? target : null;
}
