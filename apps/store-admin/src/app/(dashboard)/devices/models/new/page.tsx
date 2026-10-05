import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateDeviceModelView, DeviceModelFormSkeleton } from "@/widgets";

import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.devices.createModelHeading,
};

export default function NewDeviceModelPage() {
  return (
    <Suspense fallback={<DeviceModelFormSkeleton />}>
      <CreateDeviceModelView />
    </Suspense>
  );
}
