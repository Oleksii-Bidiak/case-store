import { PaymentOutcome } from '../../payment.types';

/**
 * LiqPay's own vocabulary. Everything in this file stops at the adapter boundary
 * — nothing outside `adapters/liqpay/` may import it (docs/payments-liqpay.md §5).
 */

/** Hosted checkout the customer's browser POSTs `data` + `signature` to. */
export const LIQPAY_CHECKOUT_URL = 'https://www.liqpay.ua/api/3/checkout';

/** Server-to-server endpoint for `status` / `refund` (same `data`+`signature` pair). */
export const LIQPAY_API_URL = 'https://www.liqpay.ua/api/request';

/**
 * The `version` field inside `data`.
 *
 * 7 is what LiqPay's live documentation and its worked example use as of
 * 2026-07-28 (`docs/payments-liqpay.md` §3 predates that check and says 3, with a
 * `[перевірити]` marker). Note this is unrelated to the `3` in the checkout URL,
 * which is a path version LiqPay still publishes alongside `version: 7`.
 */
export const LIQPAY_API_VERSION = 7;

/** Adapter key persisted on `Payment.provider`. */
export const LIQPAY_PROVIDER_KEY = 'liqpay';

/** The status LiqPay reports for every payment while the merchant is in test mode. */
export const LIQPAY_SANDBOX_STATUS = 'sandbox';

/**
 * Status → outcome, the four buckets of docs/payments-liqpay.md §7.
 *
 * `sandbox` is deliberately ABSENT: it is resolved separately in
 * {@link mapLiqPayStatus} because its meaning depends on our configuration, not
 * on LiqPay's.
 *
 * Anything not listed here falls through to {@link PaymentOutcome.IGNORED} — the
 * ~20 "still working on it" states (`3ds_verify`, `otp_verify`, `wait_secure`,
 * `wait_accept`, `hold_wait`, `processing`, `prepared`, …) plus any status LiqPay
 * adds after this was written. Default-deny is the whole point: an unrecognised
 * status must never be able to mean "paid".
 */
const OUTCOME_BY_STATUS: Readonly<Record<string, PaymentOutcome>> = {
  // Paid.
  success: PaymentOutcome.SUCCEEDED,
  // Over, and no money moved. The order survives; the customer may retry.
  failure: PaymentOutcome.FAILED,
  error: PaymentOutcome.FAILED,
  expired: PaymentOutcome.FAILED,
  // Money went back.
  reversed: PaymentOutcome.REFUNDED,
};

/**
 * Translate a LiqPay `status` string into our provider-neutral outcome.
 *
 * ## The sandbox trap
 *
 * In test mode LiqPay reports `status: "sandbox"` instead of `"success"`, and it
 * does so for any request signed with a sandbox key pair. Mapping it to
 * SUCCEEDED unconditionally would mean anyone who learns the merchant's public
 * key can mark orders paid — so it counts as success ONLY when we ourselves are
 * configured for sandbox. In production it is an outright FAILURE, not a
 * shrug-and-ignore: an order that reaches production and is told "sandbox" has
 * something badly wrong with it, and leaving it PENDING would let the reconcile
 * worker poll the same lie once a minute forever.
 */
export function mapLiqPayStatus(status: string, sandboxEnabled: boolean): PaymentOutcome {
  if (status === LIQPAY_SANDBOX_STATUS) {
    return sandboxEnabled ? PaymentOutcome.SUCCEEDED : PaymentOutcome.FAILED;
  }
  return OUTCOME_BY_STATUS[status] ?? PaymentOutcome.IGNORED;
}

/**
 * The fields we read out of a decoded callback / status response. LiqPay sends
 * ~40 more; the rest are kept verbatim in `PaymentEvent.payload` for support
 * rather than typed here.
 */
export interface LiqPayCallbackBody {
  /** OUR `Payment.id` — we handed it to LiqPay as its `order_id`. */
  order_id?: string;
  status?: string;
  /** LiqPay's own identifiers for the transaction. */
  payment_id?: string | number;
  liqpay_order_id?: string;
  amount?: string | number;
  currency?: string;
  err_code?: string;
  err_description?: string;
  /** Present on error envelopes from `/api/request` instead of `err_*`. */
  code?: string;
  description?: string;
  [key: string]: unknown;
}
