import { Suspense } from "react";
import type { Metadata } from "next";
import type { QueryClient } from "@tanstack/react-query";
import { PrefetchBoundary } from "@/shared/api/prefetch-boundary";
import { ProductDetailView, ProductDetailSkeleton } from "@/widgets";
import {
  buildProductRailParams,
  type ProductRailFilter,
} from "@/widgets/product-detail";
import {
  getProductControllerFindAllQueryOptions,
  getProductControllerFindBySlugQueryKey,
} from "@/shared/api/generated/products/products";
import type { ProductDetailResponseEnvelope } from "@/shared/api/generated/models";
import {
  createServerQueryClient,
  dehydrateForClient,
  prefetchQueries,
  serverRequestOptions,
} from "@/shared/api/query-prefetch-server";
import { JsonLd } from "@/shared/ui";
import { buildProductSchema, buildBreadcrumbSchema } from "@/shared/lib/schema";
import {
  buildOgImages,
  resolveSeo,
  resolveSiteName,
  toMetadataTitle,
} from "@/shared/lib/seo";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { SITE_URL, CURRENCY, dict, PAGE_CONTAINER } from "@/shared/config";
import { fetchProductBySlug, resolveProductRoute } from "./product-route";

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const [{ data: product, images }, seo] = await Promise.all([
      fetchProductBySlug(slug),
      fetchSeoSettings(),
    ]);

    // Precedence via the shared helper: the product's own metaTitle/
    // metaDescription (tier 1, admin override) → the product name/description
    // (tier 2) → SeoSettings defaults (tier 3), with the localized fallback kept
    // as the innermost description (TASK-241; order inverted by TASK-432 so one
    // global default can no longer describe every product in the catalogue).
    const resolved = resolveSeo({
      entityTitle: product.metaTitle,
      entityDescription: product.metaDescription,
      settings: seo,
      content: { name: product.name, description: product.description },
    });
    // TASK-433 — admin-managed store name (title template + og:site_name).
    const siteName = resolveSiteName(seo);
    const title = toMetadataTitle(resolved, {
      settings: seo,
      siteName,
      fallback: product.name,
    });
    const description =
      resolved.description ?? dict.meta.productFallbackDescription;
    const canonical = `${SITE_URL}/products/${product.slug}`;

    return {
      title,
      description,
      alternates: { canonical },
      // Replaces the root layout's `openGraph` wholesale (Next merges metadata
      // shallowly), so siteName/locale/images are re-stated here — see
      // `buildOgImages` for the image chain.
      openGraph: {
        title: title.absolute,
        description,
        url: canonical,
        siteName,
        locale: "uk_UA",
        type: "website",
        // TASK-437 — the product's own `ogImage` (an admin's deliberate 1200×630
        // card) outranks `images[0]`, which is just whatever photo sorts first
        // in the gallery. Unset, the chain is exactly what it was before.
        images: buildOgImages({
          entityOgImage: product.ogImage,
          pageImage: images[0]?.url,
          defaultOgImage: resolved.ogImage,
          alt: title.absolute,
        }),
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

  // Fetch server-side for structured data AND for the first HTML (TASK-563):
  // the same response is seeded into the query ProductDetailView reads, so the
  // server renders the whole product — name, price, breadcrumb links — instead
  // of a skeleton. Schema objects are built here (plain data); the JSX is
  // constructed outside the try/catch.
  //
  // `resolveProductRoute` settles a slug that did not load (TASK-285/874): a
  // 308 to the renamed slug, the route's `notFound()` for a product the API
  // says does not exist (the store's not-found page with `noindex` instead of
  // the «не вдалося завантажити» block a dead link used to get), `null` for an
  // outage — nothing is seeded and ProductDetailView shows its load error after
  // a client retry. On a document load `[slug]/layout.tsx` has already run the
  // same cached call ABOVE `loading.tsx`, which is what puts the 404 / 308 on
  // the wire (the skeleton shell would otherwise be flushed with a 200 first);
  // here it is a cache hit. It decides here for the client router's own
  // requests, which the layout skips (see its note): the not-found UI still
  // replaces the skeleton on a soft navigation to a dead link.
  //
  // `[slug]/loading.tsx` is this route's only loading boundary (TASK-409/832 —
  // the catalogue's moved into the `(catalog)` route group, so its grid
  // skeleton no longer wraps a product page). The in-page <Suspense> fallback
  // below keeps the skeleton UX while ProductDetailView hydrates.
  const detail = await resolveProductRoute(slug);

  const schemas = detail ? await buildProductPageSchemas(detail) : null;
  const queryClient = createServerQueryClient();
  if (detail) {
    await seedProductQueries(queryClient, slug, detail);
  }

  return (
    <div className={`${PAGE_CONTAINER} py-8`}>
      {schemas?.product && <JsonLd schema={schemas.product} />}
      {schemas?.breadcrumb && <JsonLd schema={schemas.breadcrumb} />}
      <PrefetchBoundary state={dehydrateForClient(queryClient)}>
        <Suspense fallback={<ProductDetailSkeleton />}>
          <ProductDetailView slug={slug} />
        </Suspense>
      </PrefetchBoundary>
    </div>
  );
}

/**
 * Fill the request's query client with what the PDP renders first (TASK-563):
 * the product itself — the response already in hand, not a second request —
 * and the «Сумісні аксесуари» / «Схожі товари» rails, so the first HTML links
 * on to other products too. Rail prefetches that fail are left to the client.
 */
async function seedProductQueries(
  queryClient: QueryClient,
  slug: string,
  detail: ProductDetailResponseEnvelope,
): Promise<void> {
  queryClient.setQueryData(
    getProductControllerFindBySlugQueryKey(slug),
    detail,
  );

  const railFilters: ProductRailFilter[] = [{ categoryId: detail.category.id }];
  const compatible = detail.data.compatibleDeviceModels?.[0];
  if (compatible) railFilters.push({ deviceModelId: compatible.id });

  await prefetchQueries(
    queryClient,
    railFilters.map((filter) =>
      getProductControllerFindAllQueryOptions(buildProductRailParams(filter), {
        request: serverRequestOptions(),
      }),
    ),
  );
}

/**
 * Build the product's Product + BreadcrumbList JSON-LD graphs from the fetched
 * response. Returns null on any error so the page renders without structured
 * data rather than failing.
 */
async function buildProductPageSchemas(
  detail: ProductDetailResponseEnvelope,
): Promise<{
  product: Record<string, unknown>;
  breadcrumb: Record<string, unknown>;
} | null> {
  try {
    // No FAQPage here (TASK-555). The PDP used to emit one from the GLOBAL FAQ
    // list on every product — structured data asserting questions and answers
    // the reader cannot see on this page (Google's guidelines call that out as
    // grounds for a manual action), including `[вартість]`-style placeholders.
    // The FAQ is visible on /info, and that is the one page that marks it up.
    //
    // The SEO singleton joins the fetch for one reason: `fallbackBrandName`
    // below is the brand of a product that has none of its own, and that
    // fallback is the store's name — admin-managed since TASK-433, so it can no
    // longer be read from a constant. Same tagged URL `generateMetadata` already
    // fetched, so Next dedupes it within the request and this costs nothing.
    // (This comment claimed "FALLBACK" before TASK-437 while the schema builder
    // emitted the store name unconditionally — the rename is what makes the two
    // agree.)
    const { data: product, images, category } = detail;
    const seo = await fetchSeoSettings();
    const canonical = `${SITE_URL}/products/${product.slug}`;

    return {
      product: buildProductSchema({
        product,
        images,
        siteUrl: SITE_URL,
        currency: CURRENCY,
        fallbackBrandName: resolveSiteName(seo),
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
    };
  } catch {
    return null;
  }
}
