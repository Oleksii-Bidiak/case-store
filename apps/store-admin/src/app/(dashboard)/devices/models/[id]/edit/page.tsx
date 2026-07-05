import { Suspense } from "react";
import type { Metadata } from "next";
import { EditDeviceModelView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.devices.editModelHeading,
};

interface EditDeviceModelPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditDeviceModelPage({
  params,
}: EditDeviceModelPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <EditDeviceModelView modelId={id} />
    </Suspense>
  );
}
