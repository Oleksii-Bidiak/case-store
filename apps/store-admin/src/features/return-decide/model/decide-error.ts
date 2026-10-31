import { dict } from "@/shared/config";
import { apiErrorCode, apiErrorMessage, apiErrorStatus } from "@/shared/lib";

const d = dict.returns;

/** Where a refusal of the decision belongs on screen. */
export type DecideErrorOutcome =
  | { kind: "field"; field: "reason"; message: string }
  | {
      kind: "toast";
      message: string;
      /** The return changed under the operator — read it again. */
      refetch: boolean;
    };

/** The API's 409 codes for a decision (`order/returns/return.errors.ts`). */
const CONFLICTS: Record<string, DecideErrorOutcome> = {
  RETURN_DECISION_UNCHANGED: {
    kind: "field",
    field: "reason",
    message: d.decideUnchanged,
  },
  RETURN_DECISION_LOCKED: {
    kind: "toast",
    message: d.decideLocked,
    refetch: true,
  },
  // Re-opening a refusal re-claims its units; another request took them since.
  RETURN_QUANTITY_EXCEEDED: {
    kind: "toast",
    message: d.decideQuantityExceeded,
    refetch: true,
  },
};

const FAILED: DecideErrorOutcome = {
  kind: "toast",
  message: d.decideFailed,
  refetch: false,
};

/**
 * Map a failed `POST /admin/returns/:id/decision` to what the operator should
 * see (TASK-2044). The STATUS decides and the code only refines it — the rule
 * `api-error-message.ts` is written around — so a 500 that happens to carry a
 * known code is still «не вдалося зберегти».
 */
export function decideErrorOf(error: unknown): DecideErrorOutcome {
  const status = apiErrorStatus(error);
  const code = apiErrorCode(error);

  if (status === 409) {
    return (
      (code ? CONFLICTS[code] : undefined) ?? {
        // RETURN_TRANSITION_INVALID, or anything new: the server's state
        // machine is authoritative, so read the return again and say so.
        kind: "toast",
        message: d.decideConflict,
        refetch: true,
      }
    );
  }

  if (status === 404) {
    return { kind: "toast", message: d.decideNotFound, refetch: true };
  }

  if (status === 400) {
    if (code === "RETURN_DECISION_REASON_REQUIRED") {
      return {
        kind: "field",
        field: "reason",
        message: d.decideReasonRequired,
      };
    }
    // A DTO refusal names its field (TASK-956) — the only free-text one here.
    if (/\breason\b/.test(apiErrorMessage(error) ?? "")) {
      return { kind: "field", field: "reason", message: d.decideReasonTooLong };
    }
  }

  return FAILED;
}
