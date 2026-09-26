import { dict } from "@/shared/config";
import { apiErrorStatus } from "@/shared/lib";

export type RefundErrorKind =
  "forbidden" | "conflict" | "tooLarge" | "notFound" | "generic";

/**
 * Read a refused refund by its STATUS (TASK-371; the TASK-622 rule — the body's
 * `error` field is on every response and proves nothing).
 *
 * The contract of `AdminPaymentController.refund`: 403 without
 * `payments:refund`, 404 for an unknown attempt, 409 when the attempt is not
 * SUCCEEDED (already refunded, or never paid — no code in the body), 400 when
 * the amount is over what the attempt charged. Everything else — a network
 * failure, a 5xx, LiqPay refusing upstream — is the generic sentence.
 */
export function refundErrorKind(error: unknown): RefundErrorKind {
  switch (apiErrorStatus(error)) {
    case 403:
      return "forbidden";
    case 409:
      return "conflict";
    case 400:
      return "tooLarge";
    case 404:
      return "notFound";
    default:
      return "generic";
  }
}

/** The Ukrainian sentence for {@link refundErrorKind}. */
export function refundErrorMessage(error: unknown): string {
  switch (refundErrorKind(error)) {
    case "forbidden":
      return dict.orders.refundErrorForbidden;
    case "conflict":
      return dict.orders.refundErrorConflict;
    case "tooLarge":
      return dict.orders.refundErrorTooLarge;
    case "notFound":
      return dict.orders.refundErrorNotFound;
    default:
      return dict.orders.refundErrorGeneric;
  }
}
