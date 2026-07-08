/**
 * Mail-outbox shared types & constants (TASK-103).
 *
 * The outbox is intentionally generic — a `type` discriminator plus a JSON
 * `payload` — so future transactional emails (registration, abandoned cart)
 * reuse the table without a schema change. Today only order-confirmation is
 * implemented.
 */

/** `MailOutbox.type` value for an order-confirmation email. */
export const ORDER_CONFIRMATION_MAIL_TYPE = 'order-confirmation';

/** `MailOutbox.type` value for a password-reset email (TASK-169). */
export const PASSWORD_RESET_MAIL_TYPE = 'password-reset';

/** Aggregate outcome of a single {@link MailOutboxService.dispatchDue} run. */
export interface DispatchResult {
  /** Rows delivered (or drained as a no-op when mail is disabled). */
  sent: number;
  /** Rows that failed transiently and were rescheduled with backoff. */
  retried: number;
  /** Rows that exhausted `maxAttempts` and were marked terminally FAILED. */
  failed: number;
}
