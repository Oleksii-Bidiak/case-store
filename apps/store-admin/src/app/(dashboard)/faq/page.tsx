import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AdminFaqTable, AdminFaqTableSkeleton } from "@/widgets";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.faq.metaTitle,
};

export default function FaqPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {dict.faq.heading}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {dict.faq.subheading}
          </p>
        </div>
        <Button asChild>
          <Link href="/faq/new">{dict.faq.add}</Link>
        </Button>
      </div>

      <Suspense fallback={<AdminFaqTableSkeleton />}>
        <AdminFaqTable />
      </Suspense>
    </div>
  );
}
