import { Suspense } from "react";
import type { Metadata } from "next";
import { ReturnDetailSkeleton, ReturnDetailView } from "@/widgets";
import { dict } from "@/shared/config";

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
    <Suspense fallback={<ReturnDetailSkeleton />}>
      <ReturnDetailView returnId={id} />
    </Suspense>
  );
}
