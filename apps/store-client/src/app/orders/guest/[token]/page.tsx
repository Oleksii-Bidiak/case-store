import type { Metadata } from "next";
import { Suspense } from "react";
import { GuestOrderView, OrderConfirmationSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

interface GuestOrderPageProps {
  params: Promise<{ token: string }>;
}

/**
 * `/orders/guest/[token]` — a guest's view of their own order (TASK-338).
 *
 * The URL is built server-side in `OrderService.buildGuestOrderLink` and reaches
 * the shopper only in their confirmation email. It is therefore a bearer
 * credential in a query-free path segment, which drives two decisions here:
 *
 *  - `noindex, nofollow`, and no order data in the title. A shared or
 *    accidentally-pasted link must not turn into a search result.
 *  - The token is never rendered, only passed to the fetch.
 *
 * The static `guest` segment sits beside the dynamic `[id]` segment one level up
 * (`/orders/[id]/confirmation`) and does not collide with it: App Router matches
 * a literal segment ahead of a dynamic one, and the two routes differ in depth.
 */
export const metadata: Metadata = {
  title: dict.meta.guestOrderTitle,
  robots: { index: false, follow: false },
};

export default async function GuestOrderPage({ params }: GuestOrderPageProps) {
  const { token } = await params;

  return (
    // Same container as `app/orders/page.tsx` — without it this page ran edge
    // to edge on a wide screen while every sibling route did not (TASK-407).
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <Suspense fallback={<OrderConfirmationSkeleton />}>
        <GuestOrderView token={token} />
      </Suspense>
    </div>
  );
}
