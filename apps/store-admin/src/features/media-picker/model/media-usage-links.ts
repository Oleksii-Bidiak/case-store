import type { MediaUsageEntityKind } from "@/entities/media";
import { PERM, type PermissionKey } from "@/entities/permission";

/** Where one usage of an asset can be changed, and who may go there. */
export interface MediaUsageLink {
  href: string;
  /** The key the target screen is gated by — the same one its nav item uses. */
  permission: PermissionKey;
}

/**
 * The admin screen that edits each kind of reference (wave 198, МТ6 «Відкрити →»).
 *
 * Each target is the screen whose sidebar item carries the same permission
 * (`widgets/admin-shell/admin-nav-list.tsx`), so a link is offered exactly when
 * the operator could have walked there themselves — a link to a screen that
 * answers 403 is worse than the plain row it replaces. Products go to the
 * read-only card, which `products:read` opens; every content entity to its
 * edit form; the two site-wide kinds to the SEO settings.
 *
 * `Record<…>` over the API's kind list on purpose: a fifteenth usage column
 * becomes a compile error here once the client is regenerated.
 */
const USAGE_TARGETS: Record<
  MediaUsageEntityKind,
  (entityId: string) => MediaUsageLink
> = {
  PRODUCT_IMAGE: (id) => ({
    href: `/products/${id}`,
    permission: PERM.productsRead,
  }),
  PRODUCT_DESCRIPTION: (id) => ({
    href: `/products/${id}`,
    permission: PERM.productsRead,
  }),
  PRODUCT_OG_IMAGE: (id) => ({
    href: `/products/${id}`,
    permission: PERM.productsRead,
  }),
  CATEGORY_IMAGE: (id) => ({
    href: `/categories/${id}/edit`,
    permission: PERM.categoriesWrite,
  }),
  CATEGORY_OG_IMAGE: (id) => ({
    href: `/categories/${id}/edit`,
    permission: PERM.categoriesWrite,
  }),
  BRAND_LOGO: (id) => ({
    href: `/brands/${id}/edit`,
    permission: PERM.brandsWrite,
  }),
  BANNER_IMAGE: (id) => ({
    href: `/banners/${id}/edit`,
    permission: PERM.bannersWrite,
  }),
  BLOG_COVER_IMAGE: (id) => ({
    href: `/blog/${id}/edit`,
    permission: PERM.blogWrite,
  }),
  BLOG_OG_IMAGE: (id) => ({
    href: `/blog/${id}/edit`,
    permission: PERM.blogWrite,
  }),
  BLOG_CONTENT: (id) => ({
    href: `/blog/${id}/edit`,
    permission: PERM.blogWrite,
  }),
  PAGE_CONTENT: (id) => ({
    href: `/pages/${id}/edit`,
    permission: PERM.pagesWrite,
  }),
  PAGE_OG_IMAGE: (id) => ({
    href: `/pages/${id}/edit`,
    permission: PERM.pagesWrite,
  }),
  SEO_DEFAULT_OG_IMAGE: () => ({
    href: "/settings/seo",
    permission: PERM.settingsSeo,
  }),
  SEO_STORE_LOGO: () => ({
    href: "/settings/seo",
    permission: PERM.settingsSeo,
  }),
};

/** The link for one usage, or `null` for a kind this panel does not know yet. */
export function mediaUsageLink(
  kind: string,
  entityId: string,
): MediaUsageLink | null {
  const target = (
    USAGE_TARGETS as Record<
      string,
      ((entityId: string) => MediaUsageLink) | undefined
    >
  )[kind];
  return target ? target(entityId) : null;
}
