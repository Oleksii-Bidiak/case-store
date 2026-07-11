import { Suspense } from "react";
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { ProductDetailView, ProductDetailSkeleton } from "@/widgets";
import { resolveSlugRedirect } from "@/shared/lib/slug-redirect";
import { productControllerFindBySlug } from "@/shared/api/generated/products/products";
import { JsonLd } from "@/shared/ui";
import {
  buildProductSchema,
  buildBreadcrumbSchema,
  buildFaqPageSchema,
} from "@/shared/lib/schema";
import { resolveSeo, toMetadataTitle } from "@/shared/lib/seo";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { fetchFaqItems } from "@/shared/api/faq-server";
import { SITE_URL, SITE_NAME, CURRENCY, dict } from "@/shared/config";

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const [{ data: product, images }, seo] = await Promise.all([
      productControllerFindBySlug(slug),
      fetchSeoSettings(),
    ]);

    // Precedence via the shared helper: the product's own metaTitle/
    // metaDescription (tier 1, admin override) → SeoSettings defaults (tier 2) →
    // the product name/description (tier 3), with the localized fallback kept as
    // the innermost description (TASK-241).
    const resolved = resolveSeo({
      entityTitle: product.metaTitle,
      entityDescription: product.metaDescription,
      settings: seo,
      content: { name: product.name, description: product.description },
    });
    const title = toMetadataTitle(resolved, {
      settings: seo,
      siteName: SITE_NAME,
      fallback: product.name,
    });
    const description =
      resolved.description ?? dict.meta.productFallbackDescription;
    const canonical = `${SITE_URL}/products/${product.slug}`;
    const firstImage = images[0]?.url ?? resolved.ogImage;

    return {
      title,
      description,
      alternates: { canonical },
      openGraph: {
        title: title.absolute,
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

  // TASK-285: a failed product fetch (schemas === null) is the 404 candidate
  // path — check the slug-redirect ledger and serve a permanent (308) redirect
  // when the admin renamed the slug. A genuinely dead slug (no redirect row)
  // falls through unchanged: ProductDetailView still renders its own
  // client-side not-found state.
  if (!schemas) {
    const newSlug = await resolveSlugRedirect("PRODUCT", slug);
    if (newSlug) {
      permanentRedirect(`/products/${newSlug}`);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      {schemas?.product && <JsonLd schema={schemas.product} />}
      {schemas?.breadcrumb && <JsonLd schema={schemas.breadcrumb} />}
      {schemas?.faq && <JsonLd schema={schemas.faq} />}
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
  faq: Record<string, unknown> | null;
} | null> {
  try {
    // FAQ is the global, admin-managed list (plan 116 Decision 3 — one reusable
    // list, not per-product) fetched alongside the product. The visible FAQ
    // accordion lives on the /info hub; the PDP only emits the FAQPage JSON-LD
    // (structured data) from the same source so it stays a single source of
    // truth. Null on failure → the block is simply omitted.
    const [{ data: product, images, category }, faqItems] = await Promise.all([
      productControllerFindBySlug(slug),
      fetchFaqItems(),
    ]);
    const canonical = `${SITE_URL}/products/${product.slug}`;

    const faq =
      faqItems && faqItems.length > 0
        ? buildFaqPageSchema(
            faqItems.map((item) => ({
              question: item.question,
              answer: item.answer,
            })),
          )
        : null;

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
          item: `${SITE_URL}/categories/${category.slug}`,
        },
        { name: product.name, item: canonical },
      ]),
      faq,
    };
  } catch {
    return null;
  }
}
