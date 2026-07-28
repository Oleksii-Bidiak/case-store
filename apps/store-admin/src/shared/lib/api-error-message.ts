/**
 * Pull the API's own explanation out of a failed request (TASK-334).
 *
 * Most admin failures deserve a generic toast — the operator cannot act on
 * "500". A few deserve the server's exact words, because the server is refusing
 * something deliberate and the reason is the whole message: "cannot demote the
 * last active administrator — the shop would have no way back in". Swallowing
 * that into "Не вдалося зберегти" turns a clear guard into a mystery bug.
 *
 * Returns `undefined` when the response carries no usable message, so callers
 * can fall back to their own copy with `?? dict…`.
 */
export function apiErrorMessage(error: unknown): string | undefined {
  const body = (
    error as {
      response?: { data?: { message?: unknown; error?: unknown } };
    }
  )?.response?.data;

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

/** HTTP status of a failed request, when there is one. */
export function apiErrorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}
