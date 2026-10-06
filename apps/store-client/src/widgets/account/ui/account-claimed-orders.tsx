"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui";
import { ACCOUNT_ORDERS_PATH } from "./account-nav";

/**
 * AccountClaimedOrders — "we found the orders you placed before you signed up"
 * (TASK-485).
 *
 * ── Why a banner exists at all ───────────────────────────────────────────────
 * Confirming an email address quietly moves every guest order placed with it
 * onto the account (B-5 §5). Without a word on screen, a shopper opens their
 * order list and finds orders they do not remember placing while signed in —
 * the right outcome, arrived at in a way that reads like a bug. This says what
 * happened, once.
 *
 * ── Why the count arrives in the URL ─────────────────────────────────────────
 * The claim happens inside `POST /auth/email/verify/confirm`, whose response
 * reports how many orders moved, and the verification page is the only thing
 * that ever sees that number: it is an EVENT, not a property of the account.
 * Storing it server-side would mean a column that exists to be read once and is
 * then wrong forever; caching it in the browser would resurrect the notice on a
 * device that was never told anything. A query parameter carries it exactly as
 * far as the navigation that follows the confirmation, which is precisely its
 * lifetime.
 *
 * Nothing renders for the overwhelming majority — no parameter, a zero, or a
 * value that is not a positive whole number (a hand-edited URL) all mean "say
 * nothing", never a mangled sentence.
 *
 * ── Where it shows (TASK-217) ────────────────────────────────────────────────
 * The verification page still lands on `/account?claimed=N`, where the profile
 * shows the banner with «Переглянути замовлення». That link now goes to the
 * account's order list and carries the count along, and the list shows the
 * same banner above its tabs (AccountOrders.dc.html) — without the link, since
 * the shopper is already looking at the orders. «Зрозуміло» strips only
 * `claimed`, so the list keeps its tab and page.
 */
export function AccountClaimedOrders({
  ordersLink = true,
  className,
}: {
  /** Offer «Переглянути замовлення» — off on the order list itself. */
  ordersLink?: boolean;
  /** Outer spacing; defaults to the profile's `mb-4`. */
  className?: string;
} = {}) {
  const d = dict.account.dashboard;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const claimed = Number(searchParams.get("claimed"));
  if (!Number.isInteger(claimed) || claimed <= 0) {
    return null;
  }

  /**
   * Drop the parameter so a reload — or a shared link — does not repeat an
   * announcement about something that happened once. `replace` rather than
   * `push`: this is not a place in history worth going back to.
   */
  const dismiss = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("claimed");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div
      role="status"
      className={cn(
        "mb-4 rounded-2xl border border-border bg-card p-6 shadow-card",
        className,
      )}
    >
      <h2 className="mb-1.5 text-lg font-semibold text-foreground">
        {d.claimedOrdersHeading}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {d.claimedOrdersBody(claimed)}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {/* Outline + ghost (TASK-865): «Зберегти» in the profile form below
            is the page's one primary action (design-system §1). */}
        {ordersLink && (
          <Button asChild variant="outline" className="h-11 rounded-cta px-5">
            <Link href={`${ACCOUNT_ORDERS_PATH}?claimed=${claimed}`}>
              {d.claimedOrdersCta}
            </Link>
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={dismiss}
          className="h-11 rounded-cta px-4 text-muted-foreground hover:text-foreground"
        >
          {d.claimedOrdersDismiss}
        </Button>
      </div>
    </div>
  );
}
