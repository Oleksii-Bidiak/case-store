import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateDeviceBrandView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.devices.createBrandHeading,
};

export default function NewDeviceBrandPage() {
  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <CreateDeviceBrandView />
    </Suspense>
  );
}
