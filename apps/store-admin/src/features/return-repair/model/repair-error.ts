import { RETURN_ERROR_CODE, returnRefusalOf } from "@/entities/return";
import { dict } from "@/shared/config";
import { apiErrorStatus } from "@/shared/lib";
import {
  mapServerFieldErrors,
  type ServerFieldMap,
  type ServerFieldMessages,
} from "@/shared/lib/form-errors";

const d = dict.returns;

/** Where a refusal of a repair step belongs on screen. */
export type RepairErrorOutcome =
  | {
      kind: "field";
      field: "result" | "destination" | "ttn" | "note";
      message: string;
    }
  | {
      kind: "toast";
      message: string;
      /** The return changed under the operator — read it again. */
      refetch: boolean;
    };

const FAILED: RepairErrorOutcome = {
  kind: "toast",
  message: d.repairFailed,
  refetch: false,
};

const STALE: RepairErrorOutcome = {
  kind: "toast",
  message: d.repairStepInvalid,
  refetch: true,
};

/**
 * `AddRepairStepDto` path → form field (TASK-1984 Rule 6b): the server names
 * the field in `fieldErrors` — it used to be found by a regex over the English
 * message. The free-text fields can only fail on length, hence their wording.
 */
const DTO_FIELD_MAP: ServerFieldMap = {
  destination: "destination",
  ttn: "ttn",
  note: "note",
  result: "result",
};
const DTO_FIELD_MESSAGES: ServerFieldMessages = {
  destination: d.repairServiceTooLong,
  ttn: d.repairTtnTooLong,
  note: d.repairNoteTooLong,
  result: d.repairResultRequired,
};
const DTO_FIELD_ORDER = ["destination", "ttn", "result", "note"] as const;

/**
 * Map a failed `POST /admin/returns/:id/repair-steps` to what the operator
 * should see (TASK-2045). The STATUS decides and the code refines it, as in
 * `decideErrorOf`; the wording of every coded refusal is the shared
 * `returnRefusalOf` (TASK-1966):
 *
 *  - 409 `RETURN_REPAIR_STEP_INVALID` — the step is out of order, already
 *    recorded by someone else, or the decision is no longer REPAIR. The form
 *    offered the step the page knew of, so the page is stale: say so and read
 *    the return again. Any other 409 is read the same way.
 *  - 400 `RETURN_REPAIR_RESULT_REQUIRED` — under the outcome radios.
 *  - 400 `RETURN_REPAIR_RESULT_NOT_ALLOWED` — the form sends a result only on
 *    the step that takes one, so the step itself moved: stale, as above.
 */
export function repairErrorOf(error: unknown): RepairErrorOutcome {
  const status = apiErrorStatus(error);
  const refusal = returnRefusalOf(error);

  if (refusal?.code === RETURN_ERROR_CODE.REPAIR_RESULT_REQUIRED) {
    return { kind: "field", field: "result", message: refusal.message };
  }
  if (refusal) {
    return {
      kind: "toast",
      message: refusal.message,
      refetch: refusal.refetch,
    };
  }

  if (status === 409) return STALE;
  if (status === 404) {
    return { kind: "toast", message: d.refusalNotFound, refetch: true };
  }

  if (status === 400) {
    const fields = mapServerFieldErrors(
      error,
      DTO_FIELD_MAP,
      DTO_FIELD_MESSAGES,
    );
    // The first refused field in form order is the one focused and shown.
    const field = DTO_FIELD_ORDER.find((name) => fields[name]);
    if (field) {
      return { kind: "field", field, message: fields[field] as string };
    }
  }

  return FAILED;
}
