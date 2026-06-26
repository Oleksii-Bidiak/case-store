import { Suspense } from "react";
import type { Metadata } from "next";
import { UserDetailSkeleton, UserDetailView } from "@/widgets";
import { dict } from "@/shared/config";

interface UserDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: UserDetailPageProps): Promise<Metadata> {
  const { id } = await params;

  return {
    title: dict.users.metaTitleDetail(id.slice(0, 8)),
  };
}

export default async function UserDetailPage({ params }: UserDetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<UserDetailSkeleton />}>
      <UserDetailView userId={id} />
    </Suspense>
  );
}
