import { z } from "zod";
import {
  ReturnRepairStep,
  type AddRepairStepDto,
  type RepairResult,
} from "@/entities/return";
import { dict } from "@/shared/config";

const d = dict.returns;

/** The same ceilings as `AddRepairStepDto` (`@MaxLength`). */
export const REPAIR_DESTINATION_MAX_LENGTH = 300;
export const REPAIR_TTN_MAX_LENGTH = 64;
export const REPAIR_NOTE_MAX_LENGTH = 2000;

export interface RepairFormValues {
  result: string;
  destination: string;
  ttn: string;
  note: string;
}

/** Forms.md Rule 4c — every validated field has a default. */
export const REPAIR_DEFAULT_VALUES: RepairFormValues = {
  result: "",
  destination: "",
  ttn: "",
  note: "",
};

export type RepairField = "result" | "destination" | "ttn";

/**
 * What each step asks for, besides the operator-only note every step takes
 * (TASK-2045): where it went and the waybill when it leaves for the service,
 * the outcome when it comes back, the waybill or the pickup point when the
 * customer gets it. Accepting it from the customer is the fact alone.
 */
export const REPAIR_STEP_FIELDS: Record<
  ReturnRepairStep,
  readonly RepairField[]
> = {
  [ReturnRepairStep.ACCEPTED]: [],
  [ReturnRepairStep.SENT_TO_SERVICE]: ["destination", "ttn"],
  [ReturnRepairStep.RETURNED_FROM_SERVICE]: ["result"],
  [ReturnRepairStep.HANDED_TO_CUSTOMER]: ["ttn", "destination"],
};

/**
 * One repair step (TASK-2045). Mirrors the API's rules so the operator hears
 * about them in the form, not from a 400: the outcome is required when the
 * item comes back from the service, and every text is trimmed and capped as
 * the DTO caps it. A field the step does not show is not judged.
 */
export function createRepairSchema(step: ReturnRepairStep) {
  const fields = REPAIR_STEP_FIELDS[step];
  return z
    .object({
      result: z.string(),
      destination: z.string(),
      ttn: z.string(),
      note: z.string(),
    })
    .superRefine((values, ctx) => {
      if (fields.includes("result") && values.result === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["result"],
          message: d.repairResultRequired,
        });
      }
      if (
        fields.includes("destination") &&
        values.destination.trim().length > REPAIR_DESTINATION_MAX_LENGTH
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["destination"],
          message: d.repairServiceTooLong,
        });
      }
      if (
        fields.includes("ttn") &&
        values.ttn.trim().length > REPAIR_TTN_MAX_LENGTH
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ttn"],
          message: d.repairTtnTooLong,
        });
      }
      if (values.note.trim().length > REPAIR_NOTE_MAX_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["note"],
          message: d.repairNoteTooLong,
        });
      }
    });
}

const textOrNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * The POST body: only what the step carries (a stray `result` on another step
 * is a 400), texts trimmed and a blank one sent as null.
 */
export function repairValuesToDto(
  step: ReturnRepairStep,
  values: RepairFormValues,
): AddRepairStepDto {
  const fields = REPAIR_STEP_FIELDS[step];
  const dto: AddRepairStepDto = { step, note: textOrNull(values.note) };
  if (fields.includes("result")) dto.result = values.result as RepairResult;
  if (fields.includes("destination")) {
    dto.destination = textOrNull(values.destination);
  }
  if (fields.includes("ttn")) dto.ttn = textOrNull(values.ttn);
  return dto;
}
