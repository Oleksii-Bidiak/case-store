"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { dict } from "@/shared/config";

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
 */
export function AccountClaimedOrders() {
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
      className="mb-4 rounded-2xl border border-border bg-card p-6 shadow-card"
    >
      <h2 className="mb-1.5 text-lg font-semibold text-foreground">
        {d.claimedOrdersHeading}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {d.claimedOrdersBody(claimed)}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/orders"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {d.claimedOrdersCta}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {d.claimedOrdersDismiss}
        </button>
      </div>
    </div>
  );
}
