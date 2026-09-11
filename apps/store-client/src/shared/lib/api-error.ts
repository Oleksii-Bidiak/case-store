/**
 * Read a failed API request the way the backend actually answers (TASK-402).
 *
 * The storefront used to reduce every failure to one constant per call site, so
 * a guest who could not use a promo code, a shopper whose item went out of sale,
 * and a rate-limited login all read as the same shrug. The API is far more
 * specific than that: `HttpExceptionFilter` emits `{ statusCode, error, message }`,
 * where `error` is a stable machine code (`DISCOUNT_EXPIRED`) or Nest's exception
 * name, and `message` is the human sentence — sometimes the only place a fact
 * appears at all (the name of the product that is no longer available, see
 * `order.service.ts`).
 *
 * Twin of `apps/store-admin/src/shared/lib/api-error-message.ts`. Kept as a
 * separate copy rather than shared: the two apps have no shared package, and a
 * short response reader is not worth inventing one for.
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

/** HTTP status of a failed request, when there is one. */
export function apiErrorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

/**
 * The stable machine code the API puts in `error` (e.g. `DISCOUNT_EXPIRED`).
 * Callers map it through their own dictionary — never render it raw.
 */
export function apiErrorCode(error: unknown): string | undefined {
  const value = errorBody(error)?.error;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** The API's own human explanation, when it wrote one. */
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
