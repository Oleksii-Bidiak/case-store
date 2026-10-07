import { createHash } from 'crypto';

/**
 * The path segment after `/orders/guest/`: the raw guest order access token
 * (`GET /orders/guest/:token`, and since TASK-679
 * `/orders/guest/:token/notifications/telegram[/link]`). Anyone holding it can
 * read the order for up to 60 days, so it is a credential and does not belong
 * in a log line or an error tracker.
 */
const GUEST_ORDER_TOKEN_SEGMENT = /(\/orders\/guest\/)([^/?#]+)/g;

/**
 * Mask the secrets a request URL may carry in its PATH before the URL is logged.
 *
 * A guest order token becomes `[token:<first 8 hex of its SHA-256>]`. That is
 * enough to tie together the log lines of one token, and gives nothing usable
 * back. The 8 hex characters are the same prefix the Telegram worker logs for
 * its own tokens (`tokenRef`).
 *
 * Only for what gets logged or reported. The response body's `path` is the
 * caller's own URL and is left alone.
 */
export function redactUrlSecrets(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  return url.replace(
    GUEST_ORDER_TOKEN_SEGMENT,
    (_match, prefix: string, token: string) =>
      `${prefix}[token:${createHash('sha256').update(token).digest('hex').slice(0, 8)}]`,
  );
}
