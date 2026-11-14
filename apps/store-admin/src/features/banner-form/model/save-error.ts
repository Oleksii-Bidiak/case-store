import type { UseFormSetError } from "react-hook-form";
import { apiErrorStatus } from "@/shared/lib";
import {
  applyServerFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";
import type { BannerFormInput } from "./banner-schema";

/** `CreateBannerDto` / `UpdateBannerDto` paths → form fields (TASK-1984, Rule 6b). */
export const BANNER_FIELD_MAP: ServerFieldMap = {
  title: "title",
  subtitle: "subtitle",
  imageUrl: "imageUrl",
  ctaLabel: "ctaLabel",
  ctaHref: "ctaHref",
  theme: "theme",
  scheduledAt: "scheduledAt",
  scheduledUntil: "scheduledUntil",
};

export type BannerFormSetError = UseFormSetError<BannerFormInput>;

/**
 * Puts a refused banner save's 400 under its fields (TASK-1984, Rule 6b) and
 * says whether every part of it landed — `false` leaves the toast to the
 * caller. The 409 `BANNER_PROMO_TILE_LIMIT` is about the slot count, not a
 * field, so it stays a toast (`bannerWriteErrorMessage`).
 */
export function placeBannerSaveError(
  error: unknown,
  setError: BannerFormSetError,
): boolean {
  if (apiErrorStatus(error) !== 400) return false;
  const { mapped, unmapped } = applyServerFieldErrors<BannerFormInput>(
    error,
    setError,
    BANNER_FIELD_MAP,
  );
  return mapped.length > 0 && unmapped.length === 0;
}
