import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateFaqView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.faq.metaTitleNew,
};

export default function NewFaqPage() {
  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <CreateFaqView />
    </Suspense>
  );
}
