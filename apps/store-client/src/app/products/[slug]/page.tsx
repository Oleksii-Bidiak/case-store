import { Suspense, cache } from "react";
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import type { QueryClient } from "@tanstack/react-query";
import { PrefetchBoundary } from "@/shared/api/prefetch-boundary";
import { ProductDetailView, ProductDetailSkeleton } from "@/widgets";
import {
  buildProductRailParams,
  type ProductRailFilter,
} from "@/widgets/product-detail";
import { resolveSlugRedirect } from "@/shared/lib/slug-redirect";
import {
  getProductControllerFindAllQueryOptions,
  getProductControllerFindBySlugQueryKey,
  productControllerFindBySlug,
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

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * The product read of one request, shared by `generateMetadata`, the JSON-LD
 * and the React Query prefetch (TASK-563). It is axios, which Next's `fetch`
 * dedup does not see, so without React `cache()` every PDP render downloaded the
 * product twice — and would now do it three times. The deadline keeps a silent
 * API from holding the response open (see `serverRequestOptions`).
 */
const fetchProductBySlug = cache(
  (slug: string): Promise<ProductDetailResponseEnvelope> =>
    productControllerFindBySlug(slug, serverRequestOptions()),
);

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
  // of a skeleton. On any failure JSON-LD is simply omitted and nothing is
  // seeded — ProductDetailView still fetches and handles the 404/UI itself.
  // Schema objects are built here (plain data); the JSX is constructed outside
  // the try/catch.
  const detail = await fetchProductBySlug(slug).catch(() => null);

  // TASK-285: a failed product fetch (detail === null) is the 404 candidate
  // path — check the slug-redirect ledger and serve a permanent (308) redirect
  // when the admin renamed the slug. A genuinely dead slug (no redirect row)
  // falls through unchanged: ProductDetailView still renders its own
  // client-side not-found state.
  //
  // This note used to claim the route deliberately has NO route-level
  // loading.tsx, so that no loading boundary could stream a 200 shell before
  // permanentRedirect() sets the status. That never held HERE: the catalogue's
  // loading.tsx sat one segment above and wrapped this page too — which is
  // exactly why the live run saw the CATALOGUE grid skeleton on a product page
  // (SF-PDP-03/05). TASK-409 added `[slug]/loading.tsx` with the right skeleton,
  // and TASK-832 moved the catalogue's boundary into the `(catalog)` route group
  // so it no longer wraps this route (prefetch stops at the FIRST boundary on
  // the path, so the ancestor kept winning now and then). `[slug]/loading.tsx`
  // changes which fallback renders, not whether one exists. The
  // /categories/[slug] twin has no such boundary at all and keeps the
  // precaution. Whether this route's redirect reaches the wire as a 308 status
  // or as a client-router redirect wants a live check on the demo stand — the
  // shopper lands on the new slug either way.
  //
  // The in-page <Suspense> fallback below keeps the skeleton UX while
  // ProductDetailView hydrates.
  if (!detail) {
    const newSlug = await resolveSlugRedirect("PRODUCT", slug);
    if (newSlug) {
      permanentRedirect(`/products/${newSlug}`);
    }
  }

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
