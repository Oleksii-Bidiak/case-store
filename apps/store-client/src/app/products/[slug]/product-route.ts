import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { resolveSlugRedirect } from "@/shared/lib/slug-redirect";
import { apiErrorStatus } from "@/shared/lib/api-error";
import { productControllerFindBySlug } from "@/shared/api/generated/products/products";
import type { ProductDetailResponseEnvelope } from "@/shared/api/generated/models";
import { serverRequestOptions } from "@/shared/api/query-prefetch-server";
import { readPreviewToken } from "@/shared/api/preview-server";
import { withPreviewHeader } from "@/shared/api/preview-token";

/**
 * The product read of one request, shared by `[slug]/layout.tsx`,
 * `generateMetadata`, the JSON-LD and the React Query prefetch (TASK-563,
 * TASK-874). It is axios, which Next's `fetch` dedup does not see, so without
 * React `cache()` every PDP render downloaded the product once per consumer.
 * The deadline keeps a silent API from holding the response open (see
 * `serverRequestOptions`). It lives in its own module so the layout and the
 * page share ONE `cache()` instance — two module-local copies would be two
 * reads.
 *
 * The signed preview (TASK-669): inside Next draft mode with a preview cookie
 * the read forwards the token, and store-api decides whether it opens THIS
 * product's draft. axios never touches Next's Data Cache, and a draft-mode
 * render is never stored, so there is no tag to drop. Outside a preview the
 * token is `null` and the call is the one it always was.
 */
export const fetchProductBySlug = cache(
  async (slug: string): Promise<ProductDetailResponseEnvelope> =>
    productControllerFindBySlug(
      slug,
      withPreviewHeader(serverRequestOptions(), await readPreviewToken()),
    ),
);

/**
 * Settle a PDP slug: the product when it loads, a 308 to the current slug when
 * the admin renamed it (TASK-285), the route's `notFound()` when the API says
 * the product does not exist (TASK-874) — and `null` for an outage.
 *
 * Only the API's own 404 means "no such product". Any other failure — a 502, a
 * timeout — is an outage, not an absence: the page seeds nothing,
 * ProductDetailView retries on the client and shows its load error, so an API
 * hiccup never tells a shopper (or a crawler) that a live product does not
 * exist (the TASK-793 rule the blog and categories follow).
 *
 * Cached per request so the layout and the page, which both call it on a
 * document load, consult the redirect ledger once.
 */
export const resolveProductRoute = cache(
  async (slug: string): Promise<ProductDetailResponseEnvelope | null> => {
    let missing = false;
    try {
      return await fetchProductBySlug(slug);
    } catch (error) {
      missing = apiErrorStatus(error) === 404;
    }

    // The ledger first: a rename must win over a 404.
    const newSlug = await resolveSlugRedirect("PRODUCT", slug);
    if (newSlug) {
      permanentRedirect(`/products/${newSlug}`);
    }
    if (missing) {
      notFound();
    }
    return null;
  },
);
