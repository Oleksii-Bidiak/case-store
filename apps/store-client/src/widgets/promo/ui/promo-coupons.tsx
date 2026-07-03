"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { dict } from "@/shared/config";
import { PROMO_COUPONS } from "../model/coupons";

/**
 * PromoCoupons — the "Промокоди тижня" ticket cards. Copy-to-clipboard is real
 * (navigator.clipboard with a graceful no-op fallback) and confirmed with a
 * toast; the codes themselves are static curated marketing codes (TASK-179).
 */
export function PromoCoupons() {
  async function copy(code: string) {
    try {
      await navigator.clipboard?.writeText(code);
    } catch {
      // Clipboard unavailable (insecure context / permissions) — still toast.
    }
    toast.success(dict.promo.couponCopied(code));
  }

  return (
    <section className="mt-9">
      <h2 className="mb-4 font-display text-2xl font-bold tracking-tight text-foreground">
        {dict.promo.couponsHeading}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PROMO_COUPONS.map((coupon) => (
          <div
            key={coupon.code}
            className="relative flex items-center gap-[18px] overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
          >
            {/* Ticket notches. */}
            <span className="absolute top-1/2 -left-[9px] size-[18px] -translate-y-1/2 rounded-full bg-background" />
            <span className="absolute top-1/2 -right-[9px] size-[18px] -translate-y-1/2 rounded-full bg-background" />

            <div className="shrink-0 border-r-2 border-dashed border-border pr-[18px] text-center">
              <span className="block font-display text-3xl leading-none font-bold text-sale">
                {coupon.amount}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {coupon.unit}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <b className="mb-1 block text-[14.5px] text-foreground">
                {coupon.title}
              </b>
              <p className="mb-2.5 text-xs leading-snug text-muted-foreground">
                {coupon.condition}
              </p>
              <button
                type="button"
                onClick={() => copy(coupon.code)}
                aria-label={dict.promo.couponCopyAria(coupon.code)}
                className="inline-flex h-[34px] cursor-pointer items-center gap-2 rounded-[9px] border-[1.5px] border-dashed border-primary bg-[color-mix(in_oklab,var(--color-primary)_7%,var(--color-card))] px-3 font-mono text-[13px] font-bold tracking-wide text-primary transition-colors hover:bg-[color-mix(in_oklab,var(--color-primary)_14%,var(--color-card))] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {coupon.code}
                <Copy className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
