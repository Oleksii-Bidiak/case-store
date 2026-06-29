import { Suspense } from "react";
import type { Metadata } from "next";
import { EditPageView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.pages.metaTitleEdit,
};

interface EditPagePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPagePage({ params }: EditPagePageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <EditPageView pageId={id} />
    </Suspense>
  );
}
