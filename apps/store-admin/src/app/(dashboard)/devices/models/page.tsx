import { Suspense } from "react";
import type { Metadata } from "next";
import {
  DeviceModelTable,
  DeviceModelTableSkeleton,
  DeviceSectionHeader,
} from "@/widgets";
import { dict } from "@/shared/config";

/**
 * TASK-405: this table keeps its view state (`?isActive=`, `?deviceBrandId=`,
 * `?page=`, `?search=`) in the query string. A statically prerendered route
 * serves one and the same prerender for every query string, so a hard load of a
 * filtered URL followed by a query-only `router.replace` re-renders nothing and
 * the controls go dead. Rendering on request makes each of those a real
 * navigation. Every admin route sits behind auth, so there is no static payload
 * worth keeping.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.devices.metaTitle,
};

/**
 * «Пристрої → Моделі» (wave 198, DevicesProposal ПР1): the section header with
 * its page tabs, then the model registry.
 */
export default function DeviceModelsPage() {
  return (
    <div className="flex flex-col gap-4">
      <DeviceSectionHeader active="models" />
      <Suspense fallback={<DeviceModelTableSkeleton />}>
        <DeviceModelTable />
      </Suspense>
    </div>
  );
}
