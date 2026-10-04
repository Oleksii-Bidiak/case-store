import { Suspense } from "react";
import type { Metadata } from "next";
import { AddonServiceTable, AddonServiceTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.addonServices.metaTitleNew,
};

/**
 * Wave 198 (TASK-1083): the add-on service form is a dialog over the list.
 * This deep link keeps working — it renders the list with the «Нова послуга»
 * dialog open; closing it returns to `/addon-services`.
 */
export default function NewAddonServicePage() {
  return (
    <Suspense fallback={<AddonServiceTableSkeleton />}>
      <AddonServiceTable dialog={{ mode: "create" }} />
    </Suspense>
  );
}
