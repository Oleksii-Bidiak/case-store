import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckoutView } from "@/widgets";
import { CheckoutSkeleton } from "@/shared/ui";

export const metadata: Metadata = {
  title: "Checkout | MobileStore",
  description: "Complete your purchase.",
};

export default function CheckoutPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutView />
      </Suspense>
    </div>
  );
}
