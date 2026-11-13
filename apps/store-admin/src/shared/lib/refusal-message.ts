import { apiErrorMessage, apiErrorStatus } from "./api-error-message";

/**
 * The server's own words for a REFUSAL (a 4xx) that no form field took, or
 * `undefined` — then the caller shows its own generic copy (TASK-1984, forms
 * Rule 6c).
 *
 * A 4xx is the server deliberately saying no, and its message is the reason
 * («Такий запис уже існує…»), so swallowing it into «Не вдалося зберегти»
 * drops the one thing the operator needs. A 5xx or a lost answer is a failure,
 * not a reason: its body («Internal server error») tells the operator nothing,
 * so it gets the caller's wording instead.
 *
 * Import directly (not via the barrel), like the other form helpers.
 */
export function refusalMessage(error: unknown): string | undefined {
  const status = apiErrorStatus(error);
  if (status === undefined || status >= 500) return undefined;
  return apiErrorMessage(error);
}
