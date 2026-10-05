"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { novaPoshtaTrackingUrl } from "../lib/tracking";

/** How long «Скопійовано» stays on the button before it reads «Копіювати» again. */
const COPIED_RESET_MS = 2_000;

interface OrderTrackingNumberProps {
  /** The Nova Poshta waybill (ТТН) the operator entered (TASK-335). */
  trackingNumber: string;
  className?: string;
}

/**
 * OrderTrackingNumber — «ТТН Нової Пошти · 20450123456789 · Копіювати ·
 * Відстежити ↗» (TASK-217, AccountOrders.dc.html). The order-history card
 * renders it for a SHIPPED order; the account order detail reuses it in its
 * delivery block.
 *
 * - **Copy** writes the number with `navigator.clipboard` and says so twice:
 *   the button reads «Скопійовано» for two seconds, and a polite live region
 *   announces it (precedent: the promo coupons, which toast). Nothing is
 *   claimed when the clipboard is unavailable (insecure context, denied
 *   permission) — the number stays selectable text.
 * - **Track** opens Nova Poshta's tracking page in a new tab, named as such for
 *   a screen reader; `noopener noreferrer` keeps the order URL private.
 *
 * The two inline actions keep the tile's 40px rhythm while their hit area is
 * 44px tall (`-my-3 py-3`), design-system §8. Labels are `text-foreground`:
 * `muted-foreground` on the `bg-muted` tile is 4.34:1, under the 4.5:1 floor.
 */
export function OrderTrackingNumber({
  trackingNumber,
  className,
}: OrderTrackingNumberProps) {
  const t = dict.order.tracking;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(trackingNumber);
      setCopied(true);
    } catch {
      // No clipboard here — say nothing rather than claim a copy.
    }
  }

  const action =
    "-my-3 inline-flex items-center gap-1 rounded-sm py-3 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div
      data-testid="order-tracking"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-menu bg-muted px-3.5 py-2.5 text-sm text-foreground",
        className,
      )}
    >
      <span>{t.label}</span>
      <span className="font-mono font-semibold">{trackingNumber}</span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? undefined : t.copyAria(trackingNumber)}
        className={`${action} text-foreground hover:text-primary`}
      >
        {copied ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
        {copied ? t.copied : t.copy}
      </button>
      <a
        href={novaPoshtaTrackingUrl(trackingNumber)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t.trackAria}
        className={`${action} text-primary hover:underline`}
      >
        {t.track}
        <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </a>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? t.copiedLive(trackingNumber) : ""}
      </span>
    </div>
  );
}
