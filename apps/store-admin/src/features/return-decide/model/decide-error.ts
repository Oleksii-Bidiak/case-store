import {
  RETURN_ERROR_CODE,
  returnRefusalOf,
  returnRemainingOf,
} from "@/entities/return";
import { dict } from "@/shared/config";
import { apiErrorStatus } from "@/shared/lib";
import {
  mapServerFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";

const d = dict.returns;

/** `DecideReturnDto` path → the form field. */
const DECIDE_FIELD_MAP: ServerFieldMap = {
  reason: "reason",
  decision: "decision",
};

/** Where a refusal of the decision belongs on screen. */
export type DecideErrorOutcome =
  | { kind: "field"; field: "reason" | "decision"; message: string }
  | {
      kind: "toast";
      message: string;
      /** The return changed under the operator — read it again. */
      refetch: boolean;
    };

const FAILED: DecideErrorOutcome = {
  kind: "toast",
  message: d.decideFailed,
  refetch: false,
};

/** The two refusals whose fix is in the reason field. */
const REASON_CODES: ReadonlyArray<string | null> = [
  RETURN_ERROR_CODE.DECISION_REASON_REQUIRED,
  RETURN_ERROR_CODE.DECISION_UNCHANGED,
];

/**
 * Map a failed `POST /admin/returns/:id/decision` to what the operator should
 * see (TASK-2044). The STATUS decides and the code only refines it — the rule
 * `api-error-message.ts` is written around — so a 500 that happens to carry a
 * known code is still «не вдалося зберегти».
 *
 * Every coded refusal is worded by the shared `returnRefusalOf` (TASK-1966);
 * this function only decides WHERE it goes, and keeps the decision's own copy
 * for the two cases that read better in its terms: a re-open whose units were
 * taken, and «the return moved».
 */
export function decideErrorOf(error: unknown): DecideErrorOutcome {
  const status = apiErrorStatus(error);
  const refusal = returnRefusalOf(error);

  if (refusal && REASON_CODES.includes(refusal.code)) {
    return { kind: "field", field: "reason", message: refusal.message };
  }
  if (refusal?.code === RETURN_ERROR_CODE.QUANTITY_EXCEEDED) {
    // Re-opening a refusal re-claims its units; another request took them since.
    return {
      kind: "toast",
      message: d.decideQuantityExceeded(returnRemainingOf(error)),
      refetch: true,
    };
  }
  if (
    status === 409 &&
    (!refusal || refusal.code === RETURN_ERROR_CODE.TRANSITION_INVALID)
  ) {
    // RETURN_TRANSITION_INVALID, or anything new: the server's state machine
    // is authoritative, so read the return again and say so.
    return { kind: "toast", message: d.decideConflict, refetch: true };
  }
  if (refusal) {
    return {
      kind: "toast",
      message: refusal.message,
      refetch: refusal.refetch,
    };
  }

  if (status === 404) {
    return { kind: "toast", message: d.refusalNotFound, refetch: true };
  }
  // A DTO refusal names its field in `fieldErrors` (TASK-1984 Rule 6b) — it
  // used to be read off the English message with a regex.
  if (status === 400) {
    const fields = mapServerFieldErrors(error, DECIDE_FIELD_MAP, {
      reason: d.decideReasonTooLong,
      decision: d.decideDecisionRequired,
    });
    if (fields.reason) {
      return { kind: "field", field: "reason", message: fields.reason };
    }
    if (fields.decision) {
      return { kind: "field", field: "decision", message: fields.decision };
    }
  }

  return FAILED;
}
