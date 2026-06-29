import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminProductPreviewView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.products.metaTitlePreview,
};

interface PreviewProductPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Staff-only preview of a product by slug, including deactivated products
 * (TASK-155). Not linked from the sidebar — reached via the "Preview" action on
 * the product edit page.
 */
export default async function PreviewProductPage({
  params,
}: PreviewProductPageProps) {
  const { slug } = await params;

  return (
    <Suspense>
      <AdminProductPreviewView slug={slug} />
    </Suspense>
  );
}
