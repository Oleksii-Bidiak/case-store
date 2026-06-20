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
