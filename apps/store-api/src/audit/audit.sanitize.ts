/**
 * What may and may not go into an audit row (TASK-318).
 *
 * The audit log is the one table an operator reads casually, exports, and pastes
 * into a support ticket. A password hash or a reset token that lands in it has
 * effectively been published — so the filter is a DENY-list of shapes, applied
 * before anything is serialised, and it is deliberately over-broad. A field
 * wrongly redacted costs a reviewer one extra query; a field wrongly kept costs
 * a credential.
 */

/**
 * Key patterns that are never recorded, at any depth.
 *
 * Matched as substrings, case-insensitively, so `passwordHash`, `newPassword`,
 * `refreshToken`, `totpSecret` and `codeHash` are all covered without listing
 * each one — and so a field added tomorrow with a name of that shape is covered
 * before anybody remembers this file exists.
 */
const REDACTED_KEY_PATTERNS = [
  'password',
  'passwd',
  'secret',
  'token',
  'hash',
  'salt',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'credential',
  'totp',
  'otp',
  'mfa',
  'backupcode',
  'cvv',
  'cardnumber',
];

/** Placeholder written in place of a redacted value — presence still recorded. */
export const REDACTED = '[redacted]';

/** Longest string kept verbatim. A blog post body in a diff is noise that
 *  crowds out the fields someone is actually looking for. */
const MAX_STRING_LENGTH = 500;

/** Longest array kept. Beyond this only the length is recorded. */
const MAX_ARRAY_LENGTH = 50;

/** How deep to walk. Guards against a pathological or cyclic payload. */
const MAX_DEPTH = 4;

function isRedactedKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return REDACTED_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * Produce a JSON-safe, secret-free, size-bounded copy of an arbitrary value.
 *
 * Returns `undefined` for anything that carries no information worth a row
 * (empty objects, functions), so callers can skip writing an empty diff.
 */
export function sanitizeForAudit(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…[+${value.length - MAX_STRING_LENGTH}]`
      : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (depth >= MAX_DEPTH) {
    return '[truncated]';
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) {
      return `[${value.length} items]`;
    }
    return value.map((item) => sanitizeForAudit(item, depth + 1));
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(source)) {
      if (isRedactedKey(key)) {
        result[key] = REDACTED;
        continue;
      }
      if (typeof item === 'function') {
        continue;
      }
      result[key] = sanitizeForAudit(item, depth + 1);
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  // Symbols, bigints, functions — nothing an operator would want to read.
  return undefined;
}

/**
 * Turn a mutation's request body into the `diff` shape: `{ field: { to } }`.
 *
 * Only `to`, never `from`. A generic interceptor sees the request and the
 * response, never the row as it was a moment earlier, and inventing a `from`
 * from the response would record the NEW value twice under two labels — worse
 * than an honest gap. Flows where the before-state is the interesting half
 * (a role change, a permission grant) call `AuditService.record()` directly and
 * supply both sides.
 *
 * The body of a PATCH is exactly "the fields being changed", which is what makes
 * this useful despite the missing pre-image.
 */
export function bodyToDiff(body: unknown): Record<string, { to: unknown }> | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }

  const sanitized = sanitizeForAudit(body);
  if (!sanitized || typeof sanitized !== 'object') {
    return undefined;
  }

  const diff: Record<string, { to: unknown }> = {};
  for (const [key, value] of Object.entries(sanitized as Record<string, unknown>)) {
    diff[key] = { to: value };
  }

  return Object.keys(diff).length > 0 ? diff : undefined;
}
