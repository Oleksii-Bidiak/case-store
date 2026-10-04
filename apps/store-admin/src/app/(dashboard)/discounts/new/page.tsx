import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateDiscountView, DiscountFormSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.discounts.metaTitleNew,
};

export default function NewDiscountPage() {
  return (
    <Suspense
      fallback={<DiscountFormSkeleton heading={dict.discounts.createHeading} />}
    >
      <CreateDiscountView />
    </Suspense>
  );
}
