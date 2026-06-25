import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AdminProductGroupTable } from "@/widgets";
import { Button } from "@/shared/ui";

export const metadata: Metadata = {
  title: "Product Groups — Admin",
};

export default function ProductGroupsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Product Groups</h2>
        <Button asChild>
          <Link href="/product-groups/new">Add Group</Link>
        </Button>
      </div>

      <Suspense>
        <AdminProductGroupTable />
      </Suspense>
    </div>
  );
}
