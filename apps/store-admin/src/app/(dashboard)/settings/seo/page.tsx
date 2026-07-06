import { Suspense } from "react";
import type { Metadata } from "next";
import { SeoSettingsView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.seoSettings.metaTitle,
};

export default function SeoSettingsPage() {
  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <SeoSettingsView />
    </Suspense>
  );
}
