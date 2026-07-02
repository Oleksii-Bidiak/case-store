import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckoutView } from "@/widgets";
import { CheckoutSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.checkoutTitle,
  description: dict.meta.checkoutDescription,
};

export default function CheckoutPage() {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pt-7 pb-16 sm:px-6">
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutView />
      </Suspense>
    </div>
  );
}
