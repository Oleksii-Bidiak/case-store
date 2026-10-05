import { redirect } from "next/navigation";

/**
 * Wave 198 (BlogCategoriesProposal КБ4, owner decision 2026-10-01): the
 * category form is a dialog over the list now. This address keeps working —
 * it opens that dialog.
 */
export default function NewBlogCategoryPage() {
  redirect("/blog/categories?new=1");
}
