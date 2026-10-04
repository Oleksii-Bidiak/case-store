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
 * «Пристрої → Бренди пристроїв» (wave 198, DevicesProposal ПР5): the section
 * header with its page tabs, then the sortable brand grid.
 */
export default function DeviceBrandsPage() {
  return (
    <div className="flex flex-col gap-4">
      <DeviceSectionHeader active="brands" />
      <Suspense fallback={<DeviceBrandTableSkeleton />}>
        <DeviceBrandTable />
      </Suspense>
    </div>
  );
}
