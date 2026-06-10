import { Suspense } from "react";
import type { Metadata } from "next";
import { ProductDetailView, ProductDetailSkeleton } from "@/widgets";
import { productControllerFindBySlug } from "@/shared/api/generated/products/products";

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const { data: product } = await productControllerFindBySlug(slug);
    return {
      title: `${product.name} | MobileStore`,
      description:
        typeof product.description === "string" &&
        product.description.length > 0
          ? product.description
          : "View product details.",
    };
  } catch {
    return { title: "Product | MobileStore" };
  }
}

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { slug } = await params;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <Suspense fallback={<ProductDetailSkeleton />}>
        <ProductDetailView slug={slug} />
      </Suspense>
    </div>
  );
}
