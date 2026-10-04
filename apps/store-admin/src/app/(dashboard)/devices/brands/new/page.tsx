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

/**
 * Wave 198 (TASK-1082): the device-brand form is a dialog over the grid. This
 * deep link keeps working — it renders the grid with the «Новий бренд
 * пристрою» dialog open; closing it returns to `/devices/brands`.
 */
export default function NewDeviceBrandPage() {
  return (
    <div className="flex flex-col gap-4">
      <DeviceSectionHeader active="brands" />
      <Suspense fallback={<DeviceBrandTableSkeleton />}>
        <DeviceBrandTable dialog={{ mode: "create" }} />
      </Suspense>
    </div>
  );
}
