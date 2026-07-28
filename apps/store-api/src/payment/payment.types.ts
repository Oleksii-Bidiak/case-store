/**
 * Shared vocabulary for online payments (TASK-330, plan 163).
 *
 * These types are the SEAM between two things that must not know about each
 * other: the payment module (which knows LiqPay) and the order module (which
 * knows stock, statuses and money). Neither imports the other's internals — both
 * import this file.
 *
 * Nothing here names a provider. When a second adapter lands (monobank, WayForPay
 * — see docs/payments-liqpay.md §12) it implements the same port and produces the
 * same {@link PaymentEventInput}; the order module is not touched at all.
 */

/**
 * What a provider's notification means to us, after the adapter has translated
 * its vocabulary. Providers speak ~20 status strings between them; the order
 * module only ever needs to know which of these four things happened.
 *
 * There is deliberately no "PENDING" outcome. A callback that reports work still
 * in progress (3DS, OTP, `wait_secure`, …) resolves to {@link PaymentOutcome.IGNORED}
 * and changes nothing — treating "not finished yet" as an event to act on is how
 * an order flips to paid before the money exists.
 */
export enum PaymentOutcome {
  /** Money is ours. The order may move to PAID. */
  SUCCEEDED = 'SUCCEEDED',
  /** The attempt is over and failed. The customer may start a new one. */
  FAILED = 'FAILED',
  /** Money went back to the customer. */
  REFUNDED = 'REFUNDED',
  /** Recognised, recorded, but not actionable — typically "still processing". */
  IGNORED = 'IGNORED',
}

/**
 * A single translated provider notification, ready to be applied to an order.
 *
 * `providerStatus` and `providerPaymentId` are carried through unmapped because
 * they are the idempotency key stored on PaymentEvent — see the unique constraint
 * on that model. `providerPaymentId` defaults to an empty string rather than being
 * optional for the same reason the column is NOT NULL: in Postgres two NULLs are
 * distinct inside a unique index, so a missing id must collapse to a value that
 * compares equal to itself.
 */
export interface PaymentEventInput {
  /** Our Payment row id — the identifier we handed the provider as its order id. */
  readonly paymentId: string;
  /** The provider's raw status string, exactly as received. */
  readonly providerStatus: string;
  /** The provider's own payment id, or '' when it did not send one. */
  readonly providerPaymentId: string;
  /** What the adapter decided that status means. */
  readonly outcome: PaymentOutcome;
  /**
   * Amount and currency AS REPORTED BY THE PROVIDER. The order module compares
   * them against what was originally requested and refuses a mismatch — without
   * that check a tampered amount would be accepted as payment in full.
   */
  readonly amount: string;
  readonly currency: string;
  /** Provider error code/message, kept verbatim for support. */
  readonly failureCode?: string;
  readonly failureMessage?: string;
  /** Decoded callback body for the audit trail. Never the signature or raw blob. */
  readonly payload: Record<string, unknown>;
}

/** What the order module answers after applying an event. */
export interface PaymentApplyResult {
  /** False when the event was a duplicate or non-actionable — nothing changed. */
  readonly applied: boolean;
  readonly orderId: string;
}
