import type { Metadata } from "next";
import { Suspense } from "react";
import {
  CheckoutStepIndicator,
  OrderConfirmationView,
  OrderConfirmationSkeleton,
} from "@/widgets";
import { dict } from "@/shared/config";

interface OrderConfirmationPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: OrderConfirmationPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: dict.meta.orderTitle(id.slice(0, 8).toUpperCase()),
    // Defense-in-depth alongside robots.txt's /orders Disallow (plan 143): a
    // confirmation link shared/bookmarked by a customer bypasses the crawl
    // block but still respects an in-page noindex. Not redundant — keep it.
    robots: { index: false, follow: false },
  };
}

export default async function OrderConfirmationPage({
  params,
}: OrderConfirmationPageProps) {
  const { id } = await params;

  return (
    // The page had no container at all: on a wide screen the confirmation ran
    // edge to edge while every other route sat in the same 7xl column
    // (TASK-407). Mirrors `app/orders/page.tsx`.
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      {/* Step 3 of 3 — the stepper has always named «Підтвердження» as the last
          step; this is the screen it meant. */}
      <CheckoutStepIndicator current={3} />
      <Suspense fallback={<OrderConfirmationSkeleton />}>
        <OrderConfirmationView orderId={id} />
      </Suspense>
    </div>
  );
}
