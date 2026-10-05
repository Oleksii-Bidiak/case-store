import { Suspense } from "react";
import type { Metadata } from "next";
import { AddonServiceTable, AddonServiceTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.addonServices.metaTitleEdit,
};

interface EditAddonServicePageProps {
  params: Promise<{ id: string }>;
}

/**
 * Wave 198 (TASK-1083): the add-on service form is a dialog over the list.
 * This deep link keeps working — it renders the list with that service's
 * dialog open (an unknown id says so and returns to `/addon-services`).
 */
export default async function EditAddonServicePage({
  params,
}: EditAddonServicePageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<AddonServiceTableSkeleton />}>
      <AddonServiceTable dialog={{ mode: "edit", id }} />
    </Suspense>
  );
}
