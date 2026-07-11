import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckoutView } from "@/widgets";
import { CheckoutSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.checkoutTitle,
  description: dict.meta.checkoutDescription,
  // Defense-in-depth alongside robots.txt's Disallow (plan 143): a directly
  // shared/linked checkout URL bypasses the crawl block but still respects an
  // in-page noindex once fetched. Not redundant — do not "clean up".
  robots: { index: false, follow: false },
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
