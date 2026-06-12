import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AdminCategoryTable, AdminCategoryTableSkeleton } from "@/widgets";
import { Button } from "@/shared/ui";

export const metadata: Metadata = {
  title: "Categories — Admin",
};

export default function CategoriesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Categories</h2>
        <Button asChild>
          <Link href="/categories/new">Add Category</Link>
        </Button>
      </div>

      <Suspense fallback={<AdminCategoryTableSkeleton />}>
        <AdminCategoryTable />
      </Suspense>
    </div>
  );
}
