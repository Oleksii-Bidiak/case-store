import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AdminPageTable, AdminPageTableSkeleton } from "@/widgets";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.pages.metaTitle,
};

export default function PagesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.pages.heading}
        </h2>
        <Button asChild>
          <Link href="/pages/new">{dict.pages.add}</Link>
        </Button>
      </div>

      <Suspense fallback={<AdminPageTableSkeleton />}>
        <AdminPageTable />
      </Suspense>
    </div>
  );
}
