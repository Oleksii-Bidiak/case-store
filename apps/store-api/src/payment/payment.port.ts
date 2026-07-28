import type { PaymentEventInput } from './payment.types';

/**
 * The provider-agnostic port every payment adapter implements (TASK-330).
 *
 * The rule this file exists to enforce: **nothing outside `adapters/` may know
 * which provider is configured.** Signature schemes, field names, status
 * vocabularies and endpoint URLs all live behind this interface, so adding a
 * second provider is a new folder rather than a rewrite (docs/payments-liqpay.md §12).
 *
 * Injected by token rather than by class, so the adapter is chosen once in the
 * module and every consumer depends on the interface:
 *
 * ```ts
 * { provide: PAYMENT_PROVIDER, useClass: LiqPayAdapter }
 * constructor(@Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider) {}
 * ```
 */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Everything the storefront needs in order to hand the customer to the provider. */
export interface HostedCheckoutHandoff {
  /** Where the browser must POST (or navigate) to reach the provider's page. */
  readonly url: string;
  /**
   * Form fields to POST, already signed. Opaque on purpose: LiqPay wants
   * `data` + `signature`, another provider may want nothing at all and encode
   * everything in the URL. The frontend renders whatever is here and submits it.
   */
  readonly fields: Record<string, string>;
  /** GET redirect instead of a POST form. Adapters set exactly one of the two. */
  readonly method: 'POST' | 'GET';
}

export interface CreateCheckoutParams {
  /** Our Payment row id. Goes to the provider as ITS order id — never Order.id. */
  readonly paymentId: string;
  /** Decimal string, e.g. "1249.00". Never a float. */
  readonly amount: string;
  readonly currency: string;
  readonly description: string;
  /** Where the customer's browser comes back to. UX only — never trusted. */
  readonly resultUrl: string;
  /** Where the provider POSTs its callback. The only source of truth about money. */
  readonly callbackUrl: string;
}

export interface PaymentProvider {
  /** Adapter key stored on Payment.provider, e.g. 'liqpay'. */
  readonly key: string;

  /** True when credentials are present. Mirrors NovaPoshtaClient.isConfigured(). */
  isConfigured(): boolean;

  /** Build the signed handoff that sends the customer to the hosted checkout. */
  createCheckout(params: CreateCheckoutParams): Promise<HostedCheckoutHandoff>;

  /**
   * Verify the callback signature and translate the body into our vocabulary.
   *
   * Returns null when the signature does not verify — the caller answers 400 and
   * changes nothing. Signature verification is the ADAPTER's job, never the
   * port's: the schemes differ per provider (LiqPay concatenates the private key
   * around the payload; others sign with ECDSA or HMAC).
   */
  parseCallback(body: unknown): Promise<PaymentEventInput | null>;

  /**
   * Ask the provider what it thinks the state of a payment is.
   *
   * This is the safety net, not an optimisation. LiqPay does not document its
   * callback retry behaviour, so a callback that never arrives would otherwise
   * mean a customer who paid and an order that stays unpaid forever. The
   * reconcile worker polls this for attempts still pending past a grace period.
   */
  fetchStatus(paymentId: string): Promise<PaymentEventInput | null>;

  /**
   * Send money back. Full or partial.
   *
   * The refunded state is confirmed by the resulting callback, not by this call's
   * return value — same rule as everywhere else here: the provider's asynchronous
   * notification is what moves our state.
   */
  refund(params: { paymentId: string; amount: string }): Promise<void>;
}
