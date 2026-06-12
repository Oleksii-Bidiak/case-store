import { Suspense } from "react";
import type { Metadata } from "next";
import { OrderDetailSkeleton, OrderDetailView } from "@/widgets";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: OrderDetailPageProps): Promise<Metadata> {
  const { id } = await params;

  return {
    title: `Order ${id.slice(0, 8)} — Admin`,
  };
}

export default async function OrderDetailPage({
  params,
}: OrderDetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<OrderDetailSkeleton />}>
      <OrderDetailView orderId={id} />
    </Suspense>
  );
}
