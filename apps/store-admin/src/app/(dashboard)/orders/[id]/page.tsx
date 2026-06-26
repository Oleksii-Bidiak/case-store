import { Suspense } from "react";
import type { Metadata } from "next";
import { OrderDetailSkeleton, OrderDetailView } from "@/widgets";
import { dict } from "@/shared/config";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: OrderDetailPageProps): Promise<Metadata> {
  const { id } = await params;

  return {
    title: dict.orders.metaTitleDetail(id.slice(0, 8)),
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
