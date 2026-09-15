import type { Metadata } from "next";
import { OrderLookupView } from "@/widgets";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema } from "@/shared/lib/schema";
import { SITE_URL, dict } from "@/shared/config";

/**
 * `/orders/status` — the public "check my order" page (TASK-483).
 *
 * ── Why this one IS indexable, unlike `/orders/guest/[token]` ─────────────────
 * That route's URL *is* a credential, so it carries `noindex, nofollow`. This
 * one carries nothing: it is an empty form. A customer who types "як дізнатися
 * статус замовлення" into a search engine should land here rather than on the
 * phone to an operator, which is the entire point of the page.
 *
 * ── Why the static `status` segment does not collide with `[id]` ──────────────
 * Same reason the sibling `guest` segment does not: App Router matches a literal
 * segment ahead of a dynamic one, and `/orders/[id]/confirmation` is a level
 * deeper anyway.
 */
export const metadata: Metadata = {
  title: dict.meta.orderLookupTitle,
  description: dict.meta.orderLookupDescription,
  alternates: { canonical: `${SITE_URL}/orders/status` },
};

export default function OrderStatusLookupPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <JsonLd
        schema={buildBreadcrumbSchema([
          { name: dict.orderLookup.breadcrumbHome, item: SITE_URL },
          {
            name: dict.orderLookup.breadcrumb,
            item: `${SITE_URL}/orders/status`,
          },
        ])}
      />
      <OrderLookupView />
    </div>
  );
}
