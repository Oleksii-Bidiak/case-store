import { dict } from "@/shared/config";
import {
  apiErrorCode,
  apiErrorMessage,
  apiErrorStatus,
  formatKop,
} from "@/shared/lib";

const e = dict.orderMoney.errors;

/**
 * The stable codes `order.errors.ts` answers a money write with (R2). The
 * wording is ours — the server's messages are English, written for a log.
 */
export const ORDER_MONEY_ERROR = {
  STALE: "ORDER_STALE",
  IN_KIND_NOT_ALLOWED: "ORDER_MONEY_IN_KIND_NOT_ALLOWED",
  OVERPAYMENT_REASON_REQUIRED: "ORDER_MONEY_OVERPAYMENT_REASON_REQUIRED",
  PAYOUT_REASON_REQUIRED: "ORDER_MONEY_PAYOUT_REASON_REQUIRED",
  NOTHING_PAID: "ORDER_MONEY_NOTHING_PAID",
  ORDER_LIVE: "ORDER_MONEY_ORDER_LIVE",
  RETURN_REQUIRED: "ORDER_MONEY_RETURN_REQUIRED",
  RETURN_NOT_REFUND: "ORDER_MONEY_RETURN_NOT_REFUND",
  RETURN_NOT_RECEIVED: "ORDER_MONEY_RETURN_NOT_RECEIVED",
  VOID_REFUSED: "ORDER_MONEY_VOID_REFUSED",
  REFUND_EXCEEDS_PAID: "ORDER_MONEY_REFUND_EXCEEDS_PAID",
  REVERSAL_REFUSED: "ORDER_MONEY_REVERSAL_REFUSED",
  ENTRY_INVALID: "ORDER_MONEY_ENTRY_INVALID",
  /**
   * 503 from the LiqPay refund door when LiqPay gave no readable answer: the
   * REQUESTED entry is kept (the money may have gone), so the block refetches.
   */
  REFUND_OUTCOME_UNKNOWN: "PAYMENT_REFUND_OUTCOME_UNKNOWN",
} as const;

/**
 * True for the 409 the optimistic lock raises: the order moved since the block
 * read it — another operator, or a LiqPay callback (they bump `updatedAt` too).
 * The caller refetches and says so; resending the same body would only be
 * refused again.
 */
export function isOrderStaleError(error: unknown): boolean {
  return (
    apiErrorStatus(error) === 409 &&
    apiErrorCode(error) === ORDER_MONEY_ERROR.STALE
  );
}

/**
 * The amount still available, read from the EXCEEDS message («… only 12345 kop
 * paid and not yet refunded»). The code carries no structured field — the
 * global filter forwards only `error` and `message` — so the number is in the
 * text; `null` when the message has another shape.
 */
function availableKop(error: unknown): number | null {
  const match = /only (\d+) kop/.exec(apiErrorMessage(error) ?? "");
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * What an operator reads when a money write is refused: what happened and what
 * to do. «Спробуйте ще раз» only on the generic failure — the coded refusals
 * would be refused again on a retry.
 */
export function moneyWriteErrorMessage(error: unknown): string {
  const status = apiErrorStatus(error);
  if (status === 403) return dict.orderStatus.forbidden;
  if (status === 404) return e.notFound;

  switch (apiErrorCode(error)) {
    case ORDER_MONEY_ERROR.STALE:
      return e.ORDER_STALE;
    case ORDER_MONEY_ERROR.IN_KIND_NOT_ALLOWED:
      return e.ORDER_MONEY_IN_KIND_NOT_ALLOWED;
    case ORDER_MONEY_ERROR.OVERPAYMENT_REASON_REQUIRED:
      return e.ORDER_MONEY_OVERPAYMENT_REASON_REQUIRED;
    case ORDER_MONEY_ERROR.PAYOUT_REASON_REQUIRED:
      return e.ORDER_MONEY_PAYOUT_REASON_REQUIRED;
    case ORDER_MONEY_ERROR.NOTHING_PAID:
      return e.ORDER_MONEY_NOTHING_PAID;
    case ORDER_MONEY_ERROR.ORDER_LIVE:
      return e.ORDER_MONEY_ORDER_LIVE;
    case ORDER_MONEY_ERROR.RETURN_REQUIRED:
      return e.ORDER_MONEY_RETURN_REQUIRED;
    case ORDER_MONEY_ERROR.RETURN_NOT_REFUND:
      return e.ORDER_MONEY_RETURN_NOT_REFUND;
    case ORDER_MONEY_ERROR.RETURN_NOT_RECEIVED:
      return e.ORDER_MONEY_RETURN_NOT_RECEIVED;
    case ORDER_MONEY_ERROR.VOID_REFUSED:
      return e.ORDER_MONEY_VOID_REFUSED;
    case ORDER_MONEY_ERROR.REVERSAL_REFUSED:
      return e.ORDER_MONEY_REVERSAL_REFUSED;
    case ORDER_MONEY_ERROR.ENTRY_INVALID:
      return e.ORDER_MONEY_ENTRY_INVALID;
    case ORDER_MONEY_ERROR.REFUND_OUTCOME_UNKNOWN:
      return e.PAYMENT_REFUND_OUTCOME_UNKNOWN;
    case ORDER_MONEY_ERROR.REFUND_EXCEEDS_PAID: {
      // Same code for a receipt reversal that would leave more refunded than
      // paid — that message carries no "only N kop".
      const available = availableKop(error);
      return available === null
        ? e.receiptReversalBelowRefunded
        : e.exceedsPaid(formatKop(available));
    }
    default:
      return e.generic;
  }
}

/**
 * Whether the screen is out of date after this refusal: every 409 is a fact
 * about the order the block did not know (a payment landed, a return moved),
 * so its numbers are refetched. So is an unknown LiqPay outcome: the REQUESTED
 * entry was kept and the order's numbers moved with it.
 */
export function moneyRefusalNeedsRefetch(error: unknown): boolean {
  return (
    apiErrorStatus(error) === 409 ||
    apiErrorCode(error) === ORDER_MONEY_ERROR.REFUND_OUTCOME_UNKNOWN
  );
}
