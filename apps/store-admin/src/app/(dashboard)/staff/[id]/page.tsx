import { Suspense } from "react";
import type { Metadata } from "next";
import { StaffDetailSkeleton, StaffDetailView } from "@/widgets";
import { PERM } from "@/entities/permission";
import { PermissionGate } from "@/entities/session";
import { dict } from "@/shared/config";

export const dynamic = "force-dynamic";

interface StaffDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: StaffDetailPageProps): Promise<Metadata> {
  const { id } = await params;

  // The id prefix, not the person's name: this runs on the server with no
  // session, so the account cannot be read here — and the title must not imply
  // otherwise.
  return {
    title: dict.staff.metaTitleDetail(id.slice(0, 8)),
  };
}

export default async function StaffDetailPage({
  params,
}: StaffDetailPageProps) {
  const { id } = await params;

  // TASK-639: one refusal for a manager who typed the URL, instead of the
  // card's own queries each failing with 403 on screen.
  return (
    <PermissionGate
      permission={PERM.staffRead}
      title={dict.staff.forbidden}
      hint={dict.staff.forbiddenHint}
    >
      <Suspense fallback={<StaffDetailSkeleton />}>
        <StaffDetailView userId={id} />
      </Suspense>
    </PermissionGate>
  );
}
