import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderConfirmationView, OrderConfirmationSkeleton } from "@/widgets";

interface OrderConfirmationPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: OrderConfirmationPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Order ${id.slice(0, 8).toUpperCase()} Confirmed | MobileStore`,
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
