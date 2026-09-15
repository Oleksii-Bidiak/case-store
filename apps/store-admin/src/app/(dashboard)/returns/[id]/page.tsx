import { Suspense } from "react";
import type { Metadata } from "next";
import { ReturnDetailSkeleton, ReturnDetailView } from "@/widgets";
import { dict } from "@/shared/config";
import { ReturnsPermissionGate } from "../returns-permission-gate";

interface ReturnDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ReturnDetailPageProps): Promise<Metadata> {
  const { id } = await params;

  return {
    title: dict.returns.metaTitleDetail(id.slice(0, 8)),
  };
}

export default async function ReturnDetailPage({
  params,
}: ReturnDetailPageProps) {
  const { id } = await params;

  return (
    // TASK-370: the card carries the customer's contact, the operator's internal
    // notes and the refunded amount — the deep link had to be gated too, not just
    // the list it is reached from.
    <ReturnsPermissionGate>
      <Suspense fallback={<ReturnDetailSkeleton />}>
        <ReturnDetailView returnId={id} />
      </Suspense>
    </ReturnsPermissionGate>
  );
}
