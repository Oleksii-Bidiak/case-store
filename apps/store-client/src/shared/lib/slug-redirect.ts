import { slugRedirectControllerLookup } from "@/shared/api/generated/slug-redirect/slug-redirect";

/** Content model discriminator for the slug-redirect ledger (TASK-285). */
export type SlugRedirectEntityKind =
  | "PAGE"
  | "BLOG_POST"
  | "PRODUCT"
  | "CATEGORY";

/**
 * Resolve a dead (renamed) slug to the entity's current live slug, or null
 * when no redirect is recorded (or on any lookup error — same degrade-to-null
 * idiom as every other server-side lookup helper here).
 *
 * Deliberately a PLAIN Orval Axios call, not an ISR-tagged `fetch` wrapper
 * (plan 147 §Design Decision 4): it only fires on the rare path where the
 * primary content fetch already 404'd, and it must always reflect the live DB
 * — Axios bypasses Next's patched fetch cache, giving "always fresh" for free.
 */
export async function resolveSlugRedirect(
  entity: SlugRedirectEntityKind,
  slug: string,
): Promise<string | null> {
  try {
    const { data } = await slugRedirectControllerLookup({ entity, slug });
    return data.newSlug ?? null;
  } catch {
    return null;
  }
}
