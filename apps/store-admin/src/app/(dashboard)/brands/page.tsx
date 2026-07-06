import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AdminBrandTable, AdminBrandTableSkeleton } from "@/widgets";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.brands.metaTitle,
};

export default function BrandsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.brands.heading}
        </h2>
        <Button asChild>
          <Link href="/brands/new">{dict.brands.add}</Link>
        </Button>
      </div>

      <Suspense fallback={<AdminBrandTableSkeleton />}>
        <AdminBrandTable />
      </Suspense>
    </div>
  );
}
