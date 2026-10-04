import { Suspense } from "react";
import type { Metadata } from "next";
import {
  AdminProductPreviewSkeleton,
  AdminProductPreviewView,
} from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.products.metaTitlePreview,
};

interface PreviewProductPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * «Огляд товару» — the staff overview of a product by slug, including
 * deactivated products (TASK-155, wave 198 TASK-1087). Not in the sidebar —
 * reached through «Огляд» on the product card and the edit page.
 */
export default async function PreviewProductPage({
  params,
}: PreviewProductPageProps) {
  const { slug } = await params;

  return (
    <Suspense fallback={<AdminProductPreviewSkeleton />}>
      <AdminProductPreviewView slug={slug} />
    </Suspense>
  );
}
