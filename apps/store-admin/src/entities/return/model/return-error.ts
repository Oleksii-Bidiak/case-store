import { dict } from "@/shared/config";
import { apiErrorCode, apiErrorMessage, apiErrorStatus } from "@/shared/lib";

const d = dict.returns;

/**
 * The stable codes every return endpoint refuses with — a mirror of
 * `apps/store-api/src/order/returns/return.errors.ts` (TASK-1966). The codes
 * are the contract; the wording is ours. The English `message` is never shown.
 */
export const RETURN_ERROR_CODE = {
  NOT_FOUND: "RETURN_NOT_FOUND",
  ORDER_NOT_FOUND: "RETURN_ORDER_NOT_FOUND",
  ORDER_NOT_RETURNABLE: "RETURN_ORDER_NOT_RETURNABLE",
  ITEM_NOT_IN_ORDER: "RETURN_ITEM_NOT_IN_ORDER",
  QUANTITY_EXCEEDED: "RETURN_QUANTITY_EXCEEDED",
  TRANSITION_INVALID: "RETURN_TRANSITION_INVALID",
  ALREADY_RESTOCKED: "RETURN_ALREADY_RESTOCKED",
  RESTOCK_REQUIRES_RECEIVED: "RETURN_RESTOCK_REQUIRES_RECEIVED",
  REFUND_EXCEEDS_RETURNED_VALUE: "RETURN_REFUND_EXCEEDS_RETURNED_VALUE",
  REFUND_EXCEEDS_ORDER_BALANCE: "RETURN_REFUND_EXCEEDS_ORDER_BALANCE",
  DECISION_REASON_REQUIRED: "RETURN_DECISION_REASON_REQUIRED",
  DECISION_LOCKED: "RETURN_DECISION_LOCKED",
  DECISION_UNCHANGED: "RETURN_DECISION_UNCHANGED",
  USE_DECISION_ENDPOINT: "RETURN_USE_DECISION_ENDPOINT",
  REPAIR_STEP_INVALID: "RETURN_REPAIR_STEP_INVALID",
  REPAIR_RESULT_REQUIRED: "RETURN_REPAIR_RESULT_REQUIRED",
  REPAIR_RESULT_NOT_ALLOWED: "RETURN_REPAIR_RESULT_NOT_ALLOWED",
} as const;

export type ReturnErrorCode =
  (typeof RETURN_ERROR_CODE)[keyof typeof RETURN_ERROR_CODE];

/** A refusal the operator can read — and whether the screen is now stale. */
export interface ReturnRefusal {
  /** `null` for a 403: no return code, the grant is what is missing. */
  code: ReturnErrorCode | null;
  message: string;
  /** What the operator sees changed on the server — read it again. */
  refetch: boolean;
}

/**
 * The units the API says are still returnable, read from the
 * RETURN_QUANTITY_EXCEEDED message («… — 0 remain returnable»). `null` when the
 * message does not name a number — the sentence is then shown without one.
 */
export function returnRemainingOf(error: unknown): number | null {
  const match = /(\d+)\s+remains?\s+returnable/.exec(
    apiErrorMessage(error) ?? "",
  );
  return match ? Number.parseInt(match[1], 10) : null;
}

const REFUSALS: Record<
  ReturnErrorCode,
  { message: (error: unknown) => string; refetch: boolean }
> = {
  RETURN_NOT_FOUND: { message: () => d.refusalNotFound, refetch: true },
  RETURN_ORDER_NOT_FOUND: {
    message: () => d.refusalOrderNotFound,
    refetch: true,
  },
  // The order card offered the action, so its status moved meanwhile.
  RETURN_ORDER_NOT_RETURNABLE: {
    message: () => d.refusalOrderNotReturnable,
    refetch: true,
  },
  RETURN_ITEM_NOT_IN_ORDER: {
    message: () => d.refusalItemNotInOrder,
    refetch: true,
  },
  // AD-RET-18: another request took these units — retrying cannot succeed.
  RETURN_QUANTITY_EXCEEDED: {
    message: (error) => d.refusalQuantityExceeded(returnRemainingOf(error)),
    refetch: true,
  },
  RETURN_TRANSITION_INVALID: {
    message: () => d.refusalTransitionInvalid,
    refetch: true,
  },
  RETURN_ALREADY_RESTOCKED: {
    message: () => d.resolveRestockAlreadyDone,
    refetch: true,
  },
  RETURN_RESTOCK_REQUIRES_RECEIVED: {
    message: () => d.refusalRestockRequiresReceived,
    refetch: true,
  },
  // The amount is wrong, not the screen — the operator fixes the number.
  RETURN_REFUND_EXCEEDS_RETURNED_VALUE: {
    message: () => d.resolveRefundExceedsReturnedValue(),
    refetch: false,
  },
  RETURN_REFUND_EXCEEDS_ORDER_BALANCE: {
    message: () => d.resolveRefundExceedsOrderBalance(),
    refetch: false,
  },
  RETURN_DECISION_REASON_REQUIRED: {
    message: () => d.decideReasonRequired,
    refetch: false,
  },
  RETURN_DECISION_LOCKED: { message: () => d.decideLocked, refetch: true },
  RETURN_DECISION_UNCHANGED: {
    message: () => d.decideUnchanged,
    refetch: false,
  },
  RETURN_USE_DECISION_ENDPOINT: {
    message: () => d.refusalUseDecision,
    refetch: true,
  },
  RETURN_REPAIR_STEP_INVALID: {
    message: () => d.repairStepInvalid,
    refetch: true,
  },
  RETURN_REPAIR_RESULT_REQUIRED: {
    message: () => d.repairResultRequired,
    refetch: false,
  },
  // The form sends a result only on the step that takes one — the step moved.
  RETURN_REPAIR_RESULT_NOT_ALLOWED: {
    message: () => d.repairStepInvalid,
    refetch: true,
  },
};

/** The statuses a coded return refusal travels on. */
const REFUSAL_STATUSES: ReadonlyArray<number | undefined> = [400, 404, 409];

function isReturnErrorCode(code: string | undefined): code is ReturnErrorCode {
  return (
    code !== undefined && Object.prototype.hasOwnProperty.call(REFUSALS, code)
  );
}

/**
 * Map a failed call to any return endpoint to the sentence an operator can act
 * on (TASK-1966) — or `null` when the failure is not a refusal we know (a 500,
 * the network, an uncoded or DTO 400, an unknown 409), so the caller keeps its
 * own copy for those.
 *
 * The STATUS decides and the code only refines it (`api-error-message.ts`): a
 * 500 that happens to carry a known code is still a failure to save. A 403 is
 * named, because «спробуйте ще раз» cannot cure a missing grant.
 */
export function returnRefusalOf(error: unknown): ReturnRefusal | null {
  const status = apiErrorStatus(error);
  if (status === 403) {
    return { code: null, message: d.refusalForbidden, refetch: false };
  }
  if (!REFUSAL_STATUSES.includes(status)) return null;

  const code = apiErrorCode(error);
  if (!isReturnErrorCode(code)) return null;
  const known = REFUSALS[code];
  return { code, message: known.message(error), refetch: known.refetch };
}
