import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckoutView } from "@/widgets";
import { CheckoutSkeleton } from "@/shared/ui";
import { dict, PAGE_CONTAINER } from "@/shared/config";

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
    <div className={`${PAGE_CONTAINER} pt-7 pb-16`}>
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutView />
      </Suspense>
    </div>
  );
}
