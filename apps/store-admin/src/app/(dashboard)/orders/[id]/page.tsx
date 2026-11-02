import { Suspense } from "react";
import type { Metadata } from "next";
import { OrderDetailSkeleton, OrderDetailView } from "@/widgets";
import { dict } from "@/shared/config";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
  // TASK-1977: `from` — the list query the card was opened with; the view
  // turns it into the «← Замовлення» href (only ever a query of `/orders`).
  searchParams: Promise<{ from?: string | string[] }>;
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
  searchParams,
}: OrderDetailPageProps) {
  const { id } = await params;
  const { from } = await searchParams;

  return (
    <Suspense fallback={<OrderDetailSkeleton />}>
      <OrderDetailView orderId={id} from={from} />
    </Suspense>
  );
}
