import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AdminCategoryTable, AdminCategoryTableSkeleton } from "@/widgets";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.categories.metaTitle,
};

export default function CategoriesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.categories.heading}
        </h2>
        <Button asChild>
          <Link href="/categories/new">{dict.categories.add}</Link>
        </Button>
      </div>

      <Suspense fallback={<AdminCategoryTableSkeleton />}>
        <AdminCategoryTable />
      </Suspense>
    </div>
  );
}
