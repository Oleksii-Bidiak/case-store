import { redirect } from "next/navigation";

interface EditBlogCategoryPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Wave 198 (BlogCategoriesProposal КБ4, owner decision 2026-10-01): the
 * category form is a dialog over the list now. This address keeps working —
 * it opens that dialog for the same category.
 */
export default async function EditBlogCategoryPage({
  params,
}: EditBlogCategoryPageProps) {
  const { id } = await params;
  redirect(`/blog/categories?edit=${encodeURIComponent(id)}`);
}
