import { Suspense } from "react";
import type { Metadata } from "next";
import { ProductDetailView, ProductDetailSkeleton } from "@/widgets";
import { productControllerFindBySlug } from "@/shared/api/generated/products/products";
import { JsonLd } from "@/shared/ui";
import { buildProductSchema, buildBreadcrumbSchema } from "@/shared/lib/schema";
import { SITE_URL, SITE_NAME, CURRENCY, dict } from "@/shared/config";

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const { data: product, images } = await productControllerFindBySlug(slug);
    const description =
      typeof product.description === "string" && product.description.length > 0
        ? product.description
        : dict.meta.productFallbackDescription;
    const canonical = `${SITE_URL}/products/${product.slug}`;
    const firstImage = images[0]?.url;

    return {
      title: product.name,
      description,
      alternates: { canonical },
      openGraph: {
        title: product.name,
        description,
        url: canonical,
        type: "website",
        images: firstImage ? [{ url: firstImage }] : undefined,
      },
    };
  } catch {
    return { title: dict.meta.productFallbackTitle };
  }
}

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { slug } = await params;

  // Fetch server-side for structured data. The actual UI is rendered by
  // ProductDetailView (client) via its own cached query; the API side is backed
  // by the Redis product cache. On any failure JSON-LD is simply omitted —
  // ProductDetailView still handles the 404/UI. Schema objects are built here
  // (plain data); the JSX is constructed outside the try/catch.
  const schemas = await buildProductPageSchemas(slug);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      {schemas?.product && <JsonLd schema={schemas.product} />}
      {schemas?.breadcrumb && <JsonLd schema={schemas.breadcrumb} />}
      <Suspense fallback={<ProductDetailSkeleton />}>
        <ProductDetailView slug={slug} />
      </Suspense>
    </div>
  );
}

/**
 * Fetch the product and build its Product + BreadcrumbList JSON-LD graphs.
 * Returns null on any error so the page renders without structured data rather
 * than failing.
 */
async function buildProductPageSchemas(slug: string): Promise<{
  product: Record<string, unknown>;
  breadcrumb: Record<string, unknown>;
} | null> {
  try {
    const {
      data: product,
      images,
      category,
    } = await productControllerFindBySlug(slug);
    const canonical = `${SITE_URL}/products/${product.slug}`;

    return {
      product: buildProductSchema({
        product,
        images,
        siteUrl: SITE_URL,
        currency: CURRENCY,
        brandName: SITE_NAME,
      }),
      breadcrumb: buildBreadcrumbSchema([
        { name: dict.product.breadcrumbHome, item: SITE_URL },
        { name: dict.product.breadcrumbProducts, item: `${SITE_URL}/products` },
        {
          name: category.name,
          item: `${SITE_URL}/products?categoryId=${category.id}`,
        },
        { name: product.name, item: canonical },
      ]),
    };
  } catch {
    return null;
  }
}
