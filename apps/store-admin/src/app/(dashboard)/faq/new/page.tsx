import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminFaqTable, AdminFaqTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.faq.metaTitleNew,
};

/**
 * Wave 198 (TASK-1075): the FAQ form is a dialog over the list. This deep link
 * keeps working — it renders the list with the «Нове запитання» dialog open;
 * closing it returns to `/faq`.
 */
export default function NewFaqPage() {
  return (
    <Suspense fallback={<AdminFaqTableSkeleton />}>
      <AdminFaqTable dialog={{ mode: "create" }} />
    </Suspense>
  );
}
