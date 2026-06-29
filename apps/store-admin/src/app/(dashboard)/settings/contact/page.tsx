import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteContactSettingsView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.siteContact.metaTitle,
};

export default function SiteContactSettingsPage() {
  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <SiteContactSettingsView />
    </Suspense>
  );
}
