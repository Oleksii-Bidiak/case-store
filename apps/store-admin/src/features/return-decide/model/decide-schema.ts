import { z } from "zod";
import { ReturnDecision, type DecideReturnDto } from "@/entities/return";
import { dict } from "@/shared/config";

const d = dict.returns;

/** Same ceiling as `DecideReturnDto.reason` (`@MaxLength(1000)`). */
export const DECISION_REASON_MAX_LENGTH = 1000;

/** What is decided now — the rule for the reason depends on it. */
export interface DecideContext {
  readonly currentDecision: string | null;
  readonly currentReason: string | null;
}

/**
 * The operator's decision on a return (TASK-1961, TASK-2044; B-12 §1.1).
 *
 * Mirrors `decideReturn` in the API so the operator learns what is missing
 * while the cursor is still in the form, not from a 400:
 *
 *  - a reason is required on «Відмова» and on ANY change of a decision already
 *    made — a legacy (pre-B-12) one included: the customer was told something,
 *    and is owed why it is different now;
 *  - the reason is trimmed, as the API trims it — whitespace is no reason;
 *  - the same decision with the same reason is refused (the API answers
 *    `RETURN_DECISION_UNCHANGED`); the same decision with a NEW reason is a
 *    legitimate correction and goes through.
 */
/**
 * The reason as the API stores it: trimmed, and "" when nothing visible is left —
 * a reason of invisible format characters only (zero-width space, joiner, soft
 * hyphen…) tells the customer nothing. Mirrors `DecideReturnDto`'s transform.
 */
function normalizeReason(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.replace(/\p{Cf}/gu, "").trim() === "" ? "" : trimmed;
}

export function createDecideSchema(context: DecideContext) {
  return z
    .object({
      decision: z.string(),
      reason: z.string(),
    })
    .superRefine((values, ctx) => {
      if (values.decision === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["decision"],
          message: d.decideDecisionRequired,
        });
        return;
      }

      const reason = normalizeReason(values.reason);
      if (reason.length > DECISION_REASON_MAX_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reason"],
          message: d.decideReasonTooLong,
        });
        return;
      }

      const needsReason =
        values.decision === ReturnDecision.REJECT ||
        context.currentDecision !== null;
      if (needsReason && reason === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reason"],
          message: d.decideReasonRequired,
        });
        return;
      }

      if (
        values.decision === context.currentDecision &&
        reason === (context.currentReason ?? "")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reason"],
          message: d.decideUnchanged,
        });
      }
    });
}

export interface DecideFormValues {
  decision: string;
  reason: string;
}

/** Map the form to the POST body: the reason trimmed, a blank one as null. */
export function decideValuesToDto(values: DecideFormValues): DecideReturnDto {
  const reason = normalizeReason(values.reason);
  return {
    decision: values.decision as DecideReturnDto["decision"],
    reason: reason === "" ? null : reason,
  };
}
