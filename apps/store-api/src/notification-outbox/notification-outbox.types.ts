/**
 * Mail-outbox shared types & constants (TASK-103).
 *
 * The outbox is intentionally generic — a `type` discriminator plus a JSON
 * `payload` — so future transactional emails (registration, abandoned cart)
 * reuse the table without a schema change. Today only order-confirmation is
 * implemented.
 */

/** `NotificationOutbox.type` value for an order-confirmation email. */
export const ORDER_CONFIRMATION_MAIL_TYPE = 'order-confirmation';

/** `NotificationOutbox.type` value for a password-reset email (TASK-169). */
export const PASSWORD_RESET_MAIL_TYPE = 'password-reset';

/**
 * `NotificationOutbox.type` value for the account-locked owner notice (TASK-287) — sent
 * when a correct password is presented for a deactivated/soft-deleted account.
 * The persisted rows double as the rate-limit ledger: "was one of these already
 * written for this recipient inside the window?" (see
 * {@link NotificationOutboxRepository.hasRecentByTypeAndRecipient}), which is why no
 * separate table is needed.
 */
export const ACCOUNT_LOCKED_MAIL_TYPE = 'account-locked';

/**
 * `NotificationOutbox.type` value for an email-verification link (TASK-342).
 *
 * The recipient stored on the row is the address BEING VERIFIED, which the user
 * may have already changed again by the time the worker sends. That is why the
 * address travels in the payload rather than being re-read from the user row.
 */
export const EMAIL_VERIFICATION_MAIL_TYPE = 'email-verification';

/**
 * `NotificationOutbox.type` for the letter that proves a NEW address before it becomes
 * the login (TASK-396). Recipient = the new address, carried in the payload.
 */
export const EMAIL_CHANGE_CONFIRM_MAIL_TYPE = 'email-change-confirm';

/**
 * `NotificationOutbox.type` for the warning, with a revert link, sent to the OLD address
 * when a change is requested (TASK-396).
 */
export const EMAIL_CHANGE_NOTICE_MAIL_TYPE = 'email-change-notice';

/**
 * `NotificationOutbox.type` value for the "your order has shipped" notice (TASK-335).
 *
 * Until it existed, a parcel left the warehouse and the customer found out by
 * refreshing the site — if they thought to.
 */
export const ORDER_SHIPPED_MAIL_TYPE = 'order-shipped';

/**
 * `NotificationOutbox.type` value for «оплату не отримано» (TASK-352 (b), decision B-11
 * №2): the ONE letter sent after the reconcile worker cancels an online order
 * whose reservation lapsed unpaid. Enqueued only once the cancellation has
 * really happened.
 */
export const ORDER_PAYMENT_EXPIRED_MAIL_TYPE = 'order-payment-expired';

/** Aggregate outcome of a single {@link NotificationOutboxService.dispatchDue} run. */
export interface DispatchResult {
  /** Rows delivered (or drained as a no-op when mail is disabled). */
  sent: number;
  /** Rows that failed transiently and were rescheduled with backoff. */
  retried: number;
  /** Rows that exhausted `maxAttempts` and were marked terminally FAILED. */
  failed: number;
}
