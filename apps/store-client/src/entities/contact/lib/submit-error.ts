import {
  apiErrorCode,
  apiErrorRetryAfterSeconds,
  apiErrorStatus,
} from "@/shared/lib/api-error";

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

/**
 * Whole minutes left on a refused submit, rounded UP, or `undefined` when the
 * API did not say (TASK-762). The cooldown copy used to promise "10 minutes"
 * from whenever the refusal happened, to someone who might have had one second
 * left; the API now sends the real remainder and this turns it into the unit
 * the sentence uses. Rounded up so the form never invites a retry that the
 * server will refuse again.
 */
export function contactRetryAfterMinutes(error: unknown): number | undefined {
  const seconds = apiErrorRetryAfterSeconds(error);
  return seconds === undefined
    ? undefined
    : Math.max(1, Math.ceil(seconds / 60));
}
