import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminFaqTable, AdminFaqTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.faq.metaTitleEdit,
};

interface EditFaqPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Wave 198 (TASK-1075): the FAQ form is a dialog over the list. This deep link
 * keeps working — it renders the list with that question's dialog open (an
 * unknown id says so and returns to `/faq`).
 */
export default async function EditFaqPage({ params }: EditFaqPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<AdminFaqTableSkeleton />}>
      <AdminFaqTable dialog={{ mode: "edit", id }} />
    </Suspense>
  );
}
