import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { DeviceBrandTable, DeviceBrandTableSkeleton } from "@/widgets";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.devices.metaTitle,
};

/** Admin device-brands management page (TASK-190). */
export default function DeviceBrandsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {dict.devices.brandsHeading}
          </h2>
          <nav className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-foreground">
              {dict.devices.tabBrands}
            </span>
            <Link
              href="/devices/models"
              className="text-muted-foreground hover:text-foreground"
            >
              {dict.devices.tabModels}
            </Link>
          </nav>
        </div>
        <Button asChild>
          <Link href="/devices/brands/new">{dict.devices.addBrand}</Link>
        </Button>
      </div>

      <Suspense fallback={<DeviceBrandTableSkeleton />}>
        <DeviceBrandTable />
      </Suspense>
    </div>
  );
}
