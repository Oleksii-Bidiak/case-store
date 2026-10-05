import type { ReactNode } from "react";
import { headers } from "next/headers";
import { resolveProductRoute } from "./product-route";

interface ProductSlugLayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

/**
 * Decides a dead or renamed PDP slug BEFORE `[slug]/loading.tsx` streams
 * (TASK-874), so the wire carries a real 404 / 308.
 *
 * A layout sits outside its own segment's loading boundary. The page alone
 * could not do this: the skeleton shell (TASK-409/832) is flushed with a 200
 * while the page still awaits the product, and Next cannot change a status once
 * the body streams. So the page's `notFound()` gave the branded page with
 * `noindex`, but a 200 on the wire.
 *
 * The check is skipped for the client router's own requests — prefetches and
 * soft navigations, which the browser marks `Sec-Fetch-Dest: empty` (they are
 * `fetch()` calls; Next hides its `RSC` / `Next-Router-Prefetch` headers from
 * `headers()`). Those need no status: the page's own `resolveProductRoute`
 * still renders the not-found UI or follows the redirect inside the boundary,
 * the skeleton still shows instantly on a card click, and a catalogue grid does
 * not cost one product read per prefetched card link. Everything else — a
 * browser document load (`document`), a crawler or curl (no header) — is
 * checked here; `cache()` makes the page reuse the same read, so a document
 * load still costs one API call.
 */
export default async function ProductSlugLayout({
  children,
  params,
}: ProductSlugLayoutProps) {
  const requestHeaders = await headers();
  if (requestHeaders.get("sec-fetch-dest") !== "empty") {
    const { slug } = await params;
    await resolveProductRoute(slug);
  }
  return children;
}
