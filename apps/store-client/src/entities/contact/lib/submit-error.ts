import { apiErrorCode, apiErrorStatus } from "@/shared/lib/api-error";

/**
 * The `error` code store-api puts on the per-email cooldown 429 (TASK-452,
 * `CONTACT_COOLDOWN_ERROR` in `contact.service.ts`).
 */
export const CONTACT_COOLDOWN_ERROR = "CONTACT_COOLDOWN";

export type ContactSubmitErrorKind = "cooldown" | "rateLimited" | "failed";

/**
 * Classify a failed `POST /api/contact` for the copy the form shows.
 *
 * Two different limits both answer 429, and they need different sentences: the
 * per-IP throttler clears in a minute, the per-email cooldown in ten. Telling a
 * customer who already wrote "wait a minute" sends them straight back into the
 * same refusal, so the cooldown is recognised by its code, not by the status.
 */
export function contactSubmitErrorKind(error: unknown): ContactSubmitErrorKind {
  if (apiErrorCode(error) === CONTACT_COOLDOWN_ERROR) return "cooldown";
  if (apiErrorStatus(error) === 429) return "rateLimited";
  return "failed";
}
