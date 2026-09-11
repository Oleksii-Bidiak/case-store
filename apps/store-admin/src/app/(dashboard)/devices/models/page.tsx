import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { DeviceModelTable, DeviceModelTableSkeleton } from "@/widgets";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * TASK-405: this table keeps its view state (`?status=`, `?page=`, `?search=`,
 * sort) in the query string. A statically prerendered route serves one and the
 * same prerender for every query string, so a hard load of a filtered URL
 * followed by a query-only `router.replace` re-renders nothing and the controls
 * go dead. Rendering on request makes each of those a real navigation. Every
 * admin route sits behind auth, so there is no static payload worth keeping.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.devices.metaTitle,
};

/** Admin device-models management page (TASK-190). */
export default function DeviceModelsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {dict.devices.modelsHeading}
          </h2>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/devices/brands"
              className="text-muted-foreground hover:text-foreground"
            >
              {dict.devices.tabBrands}
            </Link>
            <span className="font-semibold text-foreground">
              {dict.devices.tabModels}
            </span>
          </nav>
        </div>
        <Button asChild>
          <Link href="/devices/models/new">{dict.devices.addModel}</Link>
        </Button>
      </div>

      <Suspense fallback={<DeviceModelTableSkeleton />}>
        <DeviceModelTable />
      </Suspense>
    </div>
  );
}
