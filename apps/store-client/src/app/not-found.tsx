import type { Metadata } from "next";
import {
  NotFoundView,
  NOT_FOUND_CATEGORY_LIMIT,
  type NotFoundCategoryLink,
} from "@/widgets/not-found";
import { categoryControllerGetCategoryTree } from "@/shared/api/generated/categories/categories";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.notFoundTitle,
  description: dict.meta.notFoundDescription,
  // A 404 carries no indexable content, but crawlers may still follow its links.
  robots: { index: false, follow: true },
};

/**
 * TASK-873 — the first root categories of the store's tree, in the owner's
 * order, as the 404's shortcuts. A failed read is an empty list: the view then
 * offers the category hub, and a 404 never fails because the API did.
 */
async function getRootCategories(): Promise<NotFoundCategoryLink[]> {
  try {
    const { data } = await categoryControllerGetCategoryTree();
    return (data ?? [])
      .filter((node) => node.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .slice(0, NOT_FOUND_CATEGORY_LIMIT)
      .map(({ name, slug }) => ({ name, slug }));
  } catch {
    return [];
  }
}

/**
 * Global 404 — Next.js renders this for unmatched routes and for any
 * `notFound()` call. It sits inside the root layout, so the shared Header and
 * Footer wrap {@link NotFoundView} automatically.
 */
export default async function NotFound() {
  const categories = await getRootCategories();
  return <NotFoundView categories={categories} />;
}
