import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AdminCarouselTable, AdminCarouselTableSkeleton } from "@/widgets";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.carousels.metaTitle,
};

export default function CarouselsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.carousels.heading}
        </h2>
        <Button asChild>
          <Link href="/carousels/new">{dict.carousels.add}</Link>
        </Button>
      </div>

      <Suspense fallback={<AdminCarouselTableSkeleton />}>
        <AdminCarouselTable />
      </Suspense>
    </div>
  );
}
