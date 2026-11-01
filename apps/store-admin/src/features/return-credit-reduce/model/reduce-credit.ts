import { dict } from "@/shared/config";
import { formatKop, parseKop } from "@/shared/lib";

const m = dict.orderMoney;
const r = dict.returnMoney;

/**
 * The new «До повернення» as typed, checked the way
 * `PATCH /admin/returns/:id/credit` checks it (R2, TASK-2046): whole kopecks,
 * reduce-only — no more than the current amount — and never below what was
 * already paid out on the return (that money has gone; reverse a payout first).
 * Zero is a valid amount while nothing was paid out.
 *
 * The bounds are the server's figures as the page read them; the server stays
 * the boundary — a payout written in another tab is only known there.
 */
export function checkReducedCredit(
  raw: string,
  bounds: { currentKop: number; paidOutKop: number },
): { ok: true; kop: number } | { ok: false; message: string } {
  const kop = parseKop(raw);
  if (kop === null) return { ok: false, message: m.amountInvalid };
  if (kop > bounds.currentKop) {
    return {
      ok: false,
      message: r.reduceAboveCurrent(formatKop(bounds.currentKop)),
    };
  }
  if (kop < bounds.paidOutKop) {
    return {
      ok: false,
      message: r.reduceBelowPaidOut(formatKop(bounds.paidOutKop)),
    };
  }
  return { ok: true, kop };
}

/** The reason is required and kept as `creditReason` — blank is no reason. */
export function checkReduceReason(
  raw: string,
): { ok: true; reason: string } | { ok: false; message: string } {
  const reason = raw.trim();
  return reason.length > 0
    ? { ok: true, reason }
    : { ok: false, message: m.reasonRequired };
}
