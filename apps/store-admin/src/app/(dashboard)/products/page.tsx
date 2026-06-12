import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AdminProductTable, AdminProductTableSkeleton } from "@/widgets";
import { Button } from "@/shared/ui";

export const metadata: Metadata = {
  title: "Products — Admin",
};

export default function ProductsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Products</h2>
        <Button asChild>
          <Link href="/products/new">Add Product</Link>
        </Button>
      </div>

      <Suspense fallback={<AdminProductTableSkeleton />}>
        <AdminProductTable />
      </Suspense>
    </div>
  );
}
