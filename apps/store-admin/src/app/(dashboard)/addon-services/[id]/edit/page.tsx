import { Suspense } from "react";
import type { Metadata } from "next";
import { EditAddonServiceView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.addonServices.metaTitleEdit,
};

interface EditAddonServicePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditAddonServicePage({
  params,
}: EditAddonServicePageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <EditAddonServiceView addonServiceId={id} />
    </Suspense>
  );
}
