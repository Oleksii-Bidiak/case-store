import { Suspense } from "react";
import type { Metadata } from "next";
// Imported from the slice rather than the `@/widgets` barrel, as
// `/catalog-import` already does: the barrel is a single file every parallel
// branch appends to, and this page needs nothing from it.
import { AdminProductCardView } from "@/widgets/admin-product-card";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.products.metaTitleCard,
};

interface ProductCardPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Read-only product card (TASK-427) — reached from the product name in the list
 * and from the edit page, and linking back to both. The id-keyed counterpart to
 * `/products/preview/[slug]`, which shows the CUSTOMER's view of a position;
 * this one shows the shop's: stock split, SEO overrides, add-on exceptions and
 * the change history.
 */
export default async function ProductCardPage({
  params,
}: ProductCardPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <AdminProductCardView productId={id} />
    </Suspense>
  );
}
