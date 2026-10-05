import { Suspense } from "react";
import type { Metadata } from "next";
import {
  DeviceBrandTable,
  DeviceBrandTableSkeleton,
  DeviceSectionHeader,
} from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.devices.metaTitle,
};

interface EditDeviceBrandPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Wave 198 (TASK-1082): the device-brand form is a dialog over the grid. This
 * deep link keeps working — it renders the grid with that brand's dialog open
 * (an unknown id says so and returns to `/devices/brands`).
 */
export default async function EditDeviceBrandPage({
  params,
}: EditDeviceBrandPageProps) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-4">
      <DeviceSectionHeader active="brands" />
      <Suspense fallback={<DeviceBrandTableSkeleton />}>
        <DeviceBrandTable dialog={{ mode: "edit", id }} />
      </Suspense>
    </div>
  );
}
