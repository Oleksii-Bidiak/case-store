import { dict } from "@/shared/config";
import { apiErrorCode } from "@/shared/lib";

export interface ReturnRequestError {
  /** What to tell the customer, in Ukrainian. */
  message: string;
  /**
   * The form's idea of what is still returnable is out of date — refetch it so
   * the lines that are already claimed read «Уже заявлено» instead of offering
   * the same units again.
   */
  refreshLedger: boolean;
}

/**
 * Turn a refused «create return» into a sentence (TASK-1964).
 *
 * Keyed on the API's stable `RETURN_*` codes, never on the status alone: a 400
 * may mean «already claimed» or a DTO the server did not like, and those need
 * opposite instructions. The server's own `message` is English and never shown.
 * Anything unrecognised — the rate limit, a 5xx, a new code — keeps the generic
 * «Не вдалося надіслати заяву. Спробуйте ще раз», because the same numbers may
 * well work a minute later (SF-ACC-31).
 */
export function readReturnRequestError(error: unknown): ReturnRequestError {
  const errors = dict.returnRequest.errors;
  switch (apiErrorCode(error)) {
    case "RETURN_QUANTITY_EXCEEDED":
      return { message: errors.quantityExceeded, refreshLedger: true };
    case "RETURN_ITEM_NOT_IN_ORDER":
      return { message: errors.itemNotInOrder, refreshLedger: true };
    case "RETURN_ORDER_NOT_RETURNABLE":
      return { message: errors.orderNotReturnable, refreshLedger: false };
    case "RETURN_ORDER_NOT_FOUND":
      return { message: errors.orderNotFound, refreshLedger: false };
    default:
      return { message: dict.returnRequest.error, refreshLedger: false };
  }
}
