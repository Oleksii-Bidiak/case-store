import { Suspense } from "react";
import type { Metadata } from "next";
import { CreatePageView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.pages.metaTitleNew,
};

export default function NewPagePage() {
  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <CreatePageView />
    </Suspense>
  );
}
