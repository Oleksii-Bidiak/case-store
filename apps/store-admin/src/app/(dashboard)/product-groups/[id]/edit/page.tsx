import { Suspense } from "react";
import type { Metadata } from "next";
import { EditProductGroupView } from "@/widgets";

export const metadata: Metadata = {
  title: "Edit Group — Admin",
};

interface EditProductGroupPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductGroupPage({
  params,
}: EditProductGroupPageProps) {
  const { id } = await params;

  return (
    <Suspense>
      <EditProductGroupView groupId={id} />
    </Suspense>
  );
}
