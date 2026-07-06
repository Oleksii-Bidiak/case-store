import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AdminBannerTable, AdminBannerTableSkeleton } from "@/widgets";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.banners.metaTitle,
};

export default function BannersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.banners.heading}
        </h2>
        <Button asChild>
          <Link href="/banners/new">{dict.banners.add}</Link>
        </Button>
      </div>

      <Suspense fallback={<AdminBannerTableSkeleton />}>
        <AdminBannerTable />
      </Suspense>
    </div>
  );
}
