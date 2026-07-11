import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AddonServiceTable, AddonServiceTableSkeleton } from "@/widgets";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.addonServices.metaTitle,
};

export default function AddonServicesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.addonServices.heading}
        </h2>
        <Button asChild>
          <Link href="/addon-services/new">{dict.addonServices.add}</Link>
        </Button>
      </div>

      <p className="max-w-3xl text-sm text-muted-foreground">
        {dict.addonServices.intro}
      </p>

      <Suspense fallback={<AddonServiceTableSkeleton />}>
        <AddonServiceTable />
      </Suspense>
    </div>
  );
}
