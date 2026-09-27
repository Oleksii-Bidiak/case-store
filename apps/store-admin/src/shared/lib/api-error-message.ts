/**
 * Read a failed API request the way the backend actually answers (TASK-334,
 * TASK-810).
 *
 * `HttpExceptionFilter` emits `{ statusCode, error, message }`: `error` is a
 * stable machine code (`ORDER_STALE`) or Nest's exception name (`Bad Request`,
 * `Forbidden`), and `message` is the human sentence.
 *
 * THIS IS THE ONLY MODULE IN THE ADMIN PANEL THAT READS `error.response.data`
 * (lint-enforced in `eslint.config.mjs`, TASK-810). Five features used to open
 * the body themselves, and two of them (`order-conflict.ts`,
 * `payment-conflict.ts`) drew the wrong conclusion from it: every error body
 * carries `error`, so "the body has a code" was read as "this is a conflict" — a
 * 403 or a 500 told the operator the order had changed and to reload, forever
 * (TASK-622). Reading the body in one place is what lets the rule "the STATUS
 * decides, the code only refines" be written once.
 *
 * Twin of `apps/store-client/src/shared/lib/api-error.ts` — the two apps have no
 * shared package, and a short response reader is not worth inventing one for.
 *
 * Every function returns `undefined` when the response carries nothing usable,
 * so callers fall back to their own copy with `?? dict…`.
 */

interface ApiErrorBody {
  statusCode?: unknown;
  error?: unknown;
  message?: unknown;
}

function errorBody(error: unknown): ApiErrorBody | undefined {
  const body = (error as { response?: { data?: unknown } })?.response?.data;
  return body && typeof body === "object" ? (body as ApiErrorBody) : undefined;
}

/**
 * Pull the API's own explanation out of a failed request.
 *
 * Most admin failures deserve a generic toast — the operator cannot act on
 * "500". A few deserve the server's exact words, because the server is refusing
 * something deliberate and the reason is the whole message: "cannot demote the
 * last active administrator — the shop would have no way back in". Swallowing
 * that into "Не вдалося зберегти" turns a clear guard into a mystery bug.
 */
export function apiErrorMessage(error: unknown): string | undefined {
  const body = errorBody(error);
  if (!body) return undefined;

  // Nest's ValidationPipe answers with `message: string[]` for DTO failures.
  if (Array.isArray(body.message)) {
    const parts = body.message.filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    );
    return parts.length > 0 ? parts.join(" ") : undefined;
  }

  if (typeof body.message === "string" && body.message.length > 0) {
    return body.message;
  }

  return undefined;
}

/**
 * The code the API put in `error` (e.g. `ORDER_STALE`). Callers map it through
 * their own dictionary — never render it raw.
 *
 * NOT evidence of anything on its own: for an uncoded exception Nest fills
 * `error` with the exception's name, so every failure has one. Decide on
 * `apiErrorStatus` first and use the code to refine.
 */
export function apiErrorCode(error: unknown): string | undefined {
  const value = errorBody(error)?.error;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** HTTP status of a failed request, when there is one. */
export function apiErrorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}
