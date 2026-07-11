import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderConfirmationView, OrderConfirmationSkeleton } from "@/widgets";
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
    <Suspense fallback={<OrderConfirmationSkeleton />}>
      <OrderConfirmationView orderId={id} />
    </Suspense>
  );
}
