"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { useListActiveDiscounts } from "@/entities/discount";
import { Skeleton } from "@/shared/ui";
import { dict, H2_CLASS } from "@/shared/config";
import { mapDiscountToCoupon } from "../model/coupons";

/**
 * PromoCoupons — the "Промокоди тижня" ticket cards, wired to the live public
 * active-discounts feed (TASK-179). Every code shown is currently redeemable at
 * checkout. Copy-to-clipboard is real (navigator.clipboard with a graceful
 * no-op fallback) and confirmed with a toast. Loading shows skeletons; on error
 * an alert; when there are no active codes the whole section is hidden (an empty
 * ticket grid under a heading reads as broken).
 */
export function PromoCoupons() {
  const { data, isPending, isError } = useListActiveDiscounts();

  async function copy(code: string) {
    try {
      await navigator.clipboard?.writeText(code);
    } catch {
      // Clipboard unavailable (insecure context / permissions) — still toast.
    }
    toast.success(dict.promo.couponCopied(code));
  }

  const coupons = (data?.data ?? []).map(mapDiscountToCoupon);

  // TASK-869 — `app/promo/layout.tsx` prefetches this feed on the server, so on
  // the normal path the first render already has the tickets and the
  // placeholder below is never painted. It is the FALLBACK for a failed
  // prefetch (the client then fetches behind it). For that path the ticket card
  // carries `min-h-32` and the placeholder is `h-32` (both 128px): a one-line
  // ticket (~126.5px of content) lands at exactly the placeholder's height. A
  // ticket whose title / condition wraps (narrow columns: 320–389px, 640–767px,
  // 1024–1179px) is taller and still grows — that residual is why the layout
  // prefetches instead of relying on a fixed height.

  // Hide the section entirely when there are no active codes and nothing is
  // pending/errored — a lone heading over an empty grid reads as broken.
  if (!isPending && !isError && coupons.length === 0) {
    return null;
  }

  return (
    <section className="mt-9">
      <h2 className={`mb-4 ${H2_CLASS} text-foreground`}>
        {dict.promo.couponsHeading}
      </h2>

      {isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton
              key={i}
              data-testid="promo-coupon-skeleton"
              className="h-32 w-full rounded-2xl"
            />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.promo.couponsError}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {coupons.map((coupon) => (
            <div
              key={coupon.code}
              data-testid="promo-coupon"
              className="relative flex min-h-32 items-center gap-4 md:gap-6 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card"
            >
              {/* Ticket notches. */}
              <span className="absolute top-1/2 -left-[9px] size-[18px] -translate-y-1/2 rounded-full bg-background" />
              <span className="absolute top-1/2 -right-[9px] size-[18px] -translate-y-1/2 rounded-full bg-background" />

              <div className="shrink-0 border-r-2 border-dashed border-border pr-4 md:pr-6 text-center">
                <span className="block font-display text-3xl leading-none font-bold text-sale">
                  {coupon.amount}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {coupon.unit}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <b className="mb-1 block text-sm text-foreground">
                  {coupon.title}
                </b>
                <p className="mb-2.5 text-xs leading-snug text-muted-foreground">
                  {coupon.condition}
                </p>
                <button
                  type="button"
                  onClick={() => copy(coupon.code)}
                  aria-label={dict.promo.couponCopyAria(coupon.code)}
                  className="inline-flex h-[34px] items-center gap-2 rounded-sm border-[1.5px] border-dashed border-primary bg-[color-mix(in_oklab,var(--color-primary)_7%,var(--color-card))] px-3 font-mono text-[13px] font-bold tracking-wide text-primary transition-colors hover:bg-[color-mix(in_oklab,var(--color-primary)_14%,var(--color-card))] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {coupon.code}
                  <Copy className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
