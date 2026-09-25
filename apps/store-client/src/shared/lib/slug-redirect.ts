import { slugRedirectControllerLookup } from "@/shared/api/generated/slug-redirect/slug-redirect";

/**
 * Content model discriminator for the slug-redirect ledger (TASK-285).
 * `DEVICE_MODEL` (TASK-699) is the second segment of `/catalog/<категорія>/<модель>`.
 */
export type SlugRedirectEntityKind =
  "PAGE" | "BLOG_POST" | "PRODUCT" | "CATEGORY" | "DEVICE_MODEL";

/**
 * Where a dead address now lives (TASK-566): the live slug, plus — for an
 * entity with several route families — the namespace it is served under. For
 * PAGE that is the page kind (`LEGAL` → `/legal/…`, `INFO` → `/info/…`).
 */
export interface SlugRedirectTarget {
  newSlug: string;
  newScope: string | null;
}

/**
 * Resolve a dead address to the entity's current live one, or null when no
 * redirect is recorded (or on any lookup error — same degrade-to-null idiom as
 * every other server-side lookup helper here).
 *
 * `scope` names the namespace of the REQUESTED address (TASK-566). Pages need
 * it: `/legal/delivery` and `/info/delivery` may be two different pages with
 * two different rename histories, so the ledger keys every PAGE row by kind.
 * Single-namespace entities omit it.
 *
 * Deliberately a PLAIN Orval Axios call, not an ISR-tagged `fetch` wrapper
 * (plan 147 §Design Decision 4): it only fires on the rare path where the
 * primary content fetch already 404'd, and it must always reflect the live DB
 * — Axios bypasses Next's patched fetch cache, giving "always fresh" for free.
 */
export async function resolveSlugRedirectTarget(
  entity: SlugRedirectEntityKind,
  slug: string,
  scope?: string,
): Promise<SlugRedirectTarget | null> {
  try {
    const { data } = await slugRedirectControllerLookup({
      entity,
      slug,
      ...(scope ? { scope } : {}),
    });
    if (!data.newSlug) return null;
    return { newSlug: data.newSlug, newScope: data.newScope ?? null };
  } catch {
    return null;
  }
}

/**
 * The live slug a dead one redirects to, for a single-namespace entity
 * (product, category, blog post, device model), or null.
 */
export async function resolveSlugRedirect(
  entity: SlugRedirectEntityKind,
  slug: string,
): Promise<string | null> {
  const target = await resolveSlugRedirectTarget(entity, slug);
  return target?.newSlug ?? null;
}
