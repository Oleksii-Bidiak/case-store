import type { PageEntity, PageEntityKind } from "@/shared/api/generated/models";
import {
  fetchPublishedPage,
  fetchPublishedPageAnyKind,
} from "@/shared/api/pages-server";
import { pageCanonicalPath } from "@/shared/config";
import { resolveSlugRedirectTarget } from "./slug-redirect";

/** The two page kinds that own an address; a HUB row has none. */
function isAddressableKind(
  scope: string | null,
): scope is Extract<PageEntityKind, "LEGAL" | "INFO"> {
  return scope === "LEGAL" || scope === "INFO";
}

/**
 * Where a dead `/legal/<slug>` or `/info/<slug>` request should be sent, or null
 * when it is a genuine 404.
 *
 * Two things can kill one of those URLs:
 *
 *  1. **The page moved** — its slug was renamed, or its KIND was changed
 *     (`/legal/delivery` → `/info/delivery`). Both are recorded in the
 *     `SlugRedirect` ledger by the API, keyed by ADDRESS (TASK-566): the ledger
 *     is asked about the slug *in the kind that was requested*, and answers
 *     with the kind the page is served under now. That matters because a slug
 *     is unique per kind only — `/legal/delivery` and `/info/delivery` may be
 *     two different pages, and the renamed legal one must not be confused with
 *     the help page that still carries the old slug.
 *  2. **A kind move the ledger never saw** — made before TASK-566, when kind
 *     changes recorded nothing. Answered by finding the row without narrowing
 *     by kind (the caller's own kind has already missed, so any hit is the
 *     other kind) and asking where it lives now.
 *
 * The ledger goes FIRST: with both kinds able to hold a slug, the kind-less
 * probe could find a different page than the one the visitor bookmarked.
 *
 * Never redirects to the address that was just requested: a self-redirect is an
 * infinite loop, and the caller only reaches here after that address missed.
 */
export async function resolvePageRedirect(
  slug: string,
  requestedKind: Extract<PageEntityKind, "LEGAL" | "INFO">,
  requestedPath: string,
): Promise<string | null> {
  const toTarget = (page: PageEntity): string | null => {
    const target = pageCanonicalPath(page.kind, page.slug);
    return target && target !== requestedPath ? target : null;
  };

  const moved = await resolveSlugRedirectTarget("PAGE", slug, requestedKind);
  if (moved) {
    // The ledger names the kind; verify the page really is live there. A row
    // written before the kind was recorded (or a page moved since, on a stand
    // migrated in a different order) falls back to the kind-less read.
    const renamed =
      (isAddressableKind(moved.newScope)
        ? await fetchPublishedPage(moved.newSlug, moved.newScope)
        : null) ?? (await fetchPublishedPageAnyKind(moved.newSlug));
    const target = renamed ? toTarget(renamed) : null;
    if (target) return target;
  }

  const other = await fetchPublishedPageAnyKind(slug);
  return other ? toTarget(other) : null;
}
