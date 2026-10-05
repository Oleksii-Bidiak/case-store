import { Suspense } from "react";
import type { Metadata } from "next";
import { DeviceModelFormSkeleton, EditDeviceModelView } from "@/widgets";

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
    <Suspense fallback={<DeviceModelFormSkeleton withAside />}>
      <EditDeviceModelView modelId={id} />
    </Suspense>
  );
}
