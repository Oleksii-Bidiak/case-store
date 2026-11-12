import { RETURN_ERROR_CODE, returnRefusalOf } from "@/entities/return";
import { dict } from "@/shared/config";
import { formatKop, parseKop } from "@/shared/lib";
import {
  mapServerFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";

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

/** `ReduceReturnCreditDto` path → the dialog's input (TASK-1984 Rule 6b). */
export const REDUCE_FIELD_MAP: ServerFieldMap = {
  creditKop: "amount",
  reason: "reason",
};

/**
 * The coded refusals that are about the AMOUNT: a bound moved under the dialog
 * (the lines changed, a payout landed). Said under the amount — with the page
 * re-read behind it — rather than as a toast over a closed dialog.
 */
const AMOUNT_CODES: ReadonlySet<string> = new Set([
  RETURN_ERROR_CODE.CREDIT_ABOVE_COMPUTED,
  RETURN_ERROR_CODE.CREDIT_BELOW_PAID_OUT,
]);

/** Where a refused reduce is said (forms convention Rule 6). */
export function placeReduceRefusal(error: unknown): {
  fields: Partial<Record<"amount" | "reason", string>>;
  /** The page is out of date: re-read it. */
  refetch: boolean;
  /** Close the dialog and say `banner` as a toast — the action itself is gone. */
  close: boolean;
  banner: string | null;
} {
  const refusal = returnRefusalOf(error);
  if (refusal?.code && AMOUNT_CODES.has(refusal.code)) {
    return {
      fields: { amount: refusal.message },
      refetch: true,
      close: false,
      banner: null,
    };
  }
  if (refusal?.refetch) {
    return { fields: {}, refetch: true, close: true, banner: refusal.message };
  }
  if (!refusal) {
    // The DTO has only these two fields, so a 400 is fully placed or not at all.
    const fields = mapServerFieldErrors(error, REDUCE_FIELD_MAP, {
      amount: m.amountInvalid,
    });
    if (Object.keys(fields).length > 0) {
      return { fields, refetch: false, close: false, banner: null };
    }
  }
  return {
    fields: {},
    refetch: false,
    close: false,
    banner: refusal?.message ?? r.reduceFailed,
  };
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
