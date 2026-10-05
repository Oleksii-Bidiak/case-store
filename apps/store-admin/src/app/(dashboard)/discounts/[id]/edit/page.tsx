import { Suspense } from "react";
import type { Metadata } from "next";
import { DiscountFormSkeleton, EditDiscountView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.discounts.metaTitleEdit,
};

interface EditDiscountPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditDiscountPage({
  params,
}: EditDiscountPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<DiscountFormSkeleton />}>
      <EditDiscountView discountId={id} />
    </Suspense>
  );
}
