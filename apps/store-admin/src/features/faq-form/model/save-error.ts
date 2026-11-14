import type { UseFormSetError } from "react-hook-form";
import { apiErrorStatus } from "@/shared/lib";
import {
  applyServerFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";
import type { FaqFormInput } from "./faq-schema";

/** `CreateFaqItemDto` / `UpdateFaqItemDto` paths → form fields (TASK-1984, Rule 6b). */
export const FAQ_FIELD_MAP: ServerFieldMap = {
  question: "question",
  answer: "answer",
};

export type FaqFormSetError = UseFormSetError<FaqFormInput>;

/**
 * Puts a refused FAQ save's 400 under its fields (TASK-1984, Rule 6b) and says
 * whether every part of it landed — `false` leaves the toast to the caller.
 */
export function placeFaqSaveError(
  error: unknown,
  setError: FaqFormSetError,
): boolean {
  if (apiErrorStatus(error) !== 400) return false;
  const { mapped, unmapped } = applyServerFieldErrors<FaqFormInput>(
    error,
    setError,
    FAQ_FIELD_MAP,
  );
  return mapped.length > 0 && unmapped.length === 0;
}
