import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AdminDiscountTable, AdminDiscountTableSkeleton } from "@/widgets";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.discounts.metaTitle,
};

export default function DiscountsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">
          {dict.discounts.heading}
        </h2>
        <Button asChild>
          <Link href="/discounts/new">{dict.discounts.add}</Link>
        </Button>
      </div>

      <Suspense fallback={<AdminDiscountTableSkeleton />}>
        <AdminDiscountTable />
      </Suspense>
    </div>
  );
}
