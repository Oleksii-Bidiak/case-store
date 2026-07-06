import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AdminProductTable, AdminProductTableSkeleton } from "@/widgets";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.products.metaTitle,
};

export default function ProductsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.products.heading}
        </h2>
        <Button asChild>
          <Link href="/products/new">{dict.products.add}</Link>
        </Button>
      </div>

      <Suspense fallback={<AdminProductTableSkeleton />}>
        <AdminProductTable />
      </Suspense>
    </div>
  );
}
