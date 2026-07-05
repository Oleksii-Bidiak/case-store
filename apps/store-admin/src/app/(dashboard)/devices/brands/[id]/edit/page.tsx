import { Suspense } from "react";
import type { Metadata } from "next";
import { EditDeviceBrandView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.devices.editBrandHeading,
};

interface EditDeviceBrandPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditDeviceBrandPage({
  params,
}: EditDeviceBrandPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <EditDeviceBrandView brandId={id} />
    </Suspense>
  );
}
