import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateDeviceModelView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.devices.createModelHeading,
};

export default function NewDeviceModelPage() {
  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <CreateDeviceModelView />
    </Suspense>
  );
}
