import type { UseFormSetError } from "react-hook-form";
import { apiErrorStatus } from "@/shared/lib";
import {
  applyServerFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";
import type { CarouselFormInput } from "./carousel-schema";

/** `CreateCarouselDto` / `UpdateCarouselDto` paths → form fields (TASK-1984, Rule 6b). */
export const CAROUSEL_FIELD_MAP: ServerFieldMap = {
  title: "title",
  categoryId: "categoryId",
  itemLimit: "itemLimit",
  scheduledAt: "scheduledAt",
};

export type CarouselFormSetError = UseFormSetError<CarouselFormInput>;

/**
 * Puts a refused carousel save's 400 under its fields (TASK-1984, Rule 6b) and
 * says whether every part of it landed — `false` leaves the toast to the caller.
 */
export function placeCarouselSaveError(
  error: unknown,
  setError: CarouselFormSetError,
): boolean {
  if (apiErrorStatus(error) !== 400) return false;
  const { mapped, unmapped } = applyServerFieldErrors<CarouselFormInput>(
    error,
    setError,
    CAROUSEL_FIELD_MAP,
  );
  return mapped.length > 0 && unmapped.length === 0;
}
