import { dict } from "@/shared/config";
import { apiErrorCode, apiErrorStatus } from "@/shared/lib";

const d = dict.orders;

/** The 409 codes `POST /admin/orders/:id/parcel-returned` answers with. */
const CONFLICT_MESSAGES: Record<string, string> = {
  ORDER_PARCEL_ALREADY_RETURNED: d.parcelReturnAlready,
  ORDER_NOT_CANCELLED_AFTER_SHIPMENT: d.parcelReturnNotShipped,
  ORDER_HAS_RETURN: d.parcelReturnHasReturn,
};

/**
 * Why the parcel could not be taken back (TASK-2575), in the operator's words.
 *
 * `conflict` is true for the 409s: the order is not what this card showed —
 * the stock already came back, the order was cancelled before shipping, or a
 * return request owns the stock now — so the caller re-reads the order. Every
 * other failure gets the generic copy; the server's English never reaches the
 * operator.
 */
export function parcelReturnErrorMessage(error: unknown): {
  message: string;
  conflict: boolean;
} {
  const code = apiErrorCode(error);
  const known = code ? CONFLICT_MESSAGES[code] : undefined;
  if (apiErrorStatus(error) === 409 && known) {
    return { message: known, conflict: true };
  }
  return { message: d.parcelReturnFailed, conflict: false };
}
