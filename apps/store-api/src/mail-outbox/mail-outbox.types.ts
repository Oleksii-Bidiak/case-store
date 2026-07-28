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

/**
 * `MailOutbox.type` value for the account-locked owner notice (TASK-287) — sent
 * when a correct password is presented for a deactivated/soft-deleted account.
 * The persisted rows double as the rate-limit ledger: "was one of these already
 * written for this recipient inside the window?" (see
 * {@link MailOutboxRepository.hasRecentByTypeAndRecipient}), which is why no
 * separate table is needed.
 */
export const ACCOUNT_LOCKED_MAIL_TYPE = 'account-locked';

/**
 * `MailOutbox.type` value for the "your order has shipped" notice (TASK-335).
 *
 * Until it existed, a parcel left the warehouse and the customer found out by
 * refreshing the site — if they thought to.
 */
export const ORDER_SHIPPED_MAIL_TYPE = 'order-shipped';

/** Aggregate outcome of a single {@link MailOutboxService.dispatchDue} run. */
export interface DispatchResult {
  /** Rows delivered (or drained as a no-op when mail is disabled). */
  sent: number;
  /** Rows that failed transiently and were rescheduled with backoff. */
  retried: number;
  /** Rows that exhausted `maxAttempts` and were marked terminally FAILED. */
  failed: number;
}
