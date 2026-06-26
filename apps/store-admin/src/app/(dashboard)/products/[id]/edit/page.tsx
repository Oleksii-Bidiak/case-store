import { Suspense } from "react";
import type { Metadata } from "next";
import { EditProductView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.products.metaTitleEdit,
};

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  const { id } = await params;

  return (
    <Suspense>
      <EditProductView productId={id} />
    </Suspense>
  );
}
