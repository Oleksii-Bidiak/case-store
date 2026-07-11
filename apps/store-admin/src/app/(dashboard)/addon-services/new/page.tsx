import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateAddonServiceView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.addonServices.metaTitleNew,
};

export default function NewAddonServicePage() {
  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <CreateAddonServiceView />
    </Suspense>
  );
}
