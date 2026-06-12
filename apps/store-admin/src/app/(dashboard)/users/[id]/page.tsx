import { Suspense } from "react";
import type { Metadata } from "next";
import { UserDetailSkeleton, UserDetailView } from "@/widgets";

interface UserDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: UserDetailPageProps): Promise<Metadata> {
  const { id } = await params;

  return {
    title: `User ${id.slice(0, 8)} — Admin`,
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
