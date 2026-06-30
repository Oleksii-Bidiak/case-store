import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateDiscountView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.discounts.metaTitleNew,
};

export default function NewDiscountPage() {
  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <CreateDiscountView />
    </Suspense>
  );
}
