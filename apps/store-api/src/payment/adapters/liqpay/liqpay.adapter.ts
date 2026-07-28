import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type {
  CreateCheckoutParams,
  HostedCheckoutHandoff,
  PaymentProvider,
} from '../../payment.port';
import type { PaymentEventInput } from '../../payment.types';
import { signLiqPayData, verifyLiqPaySignature } from './liqpay.signature';
import {
  LIQPAY_API_URL,
  LIQPAY_API_VERSION,
  LIQPAY_CHECKOUT_URL,
  LIQPAY_PROVIDER_KEY,
  mapLiqPayStatus,
  type LiqPayCallbackBody,
} from './liqpay.types';

/** Payment methods LiqPay offers when `LIQPAY_PAYTYPES` is unset. */
const DEFAULT_PAYTYPES = 'card,apay,gpay,privat24';

/**
 * LiqPayAdapter — the ONLY place in the codebase that knows what LiqPay is.
 *
 * Implements {@link PaymentProvider}: builds the signed `data`/`signature` pair
 * for the hosted checkout, verifies inbound callbacks, polls status, and issues
 * refunds. Field names, the endpoint URLs, the API version and the status
 * vocabulary all stop here — the service, the webhook controller and the order
 * module see only {@link PaymentEventInput} (docs/payments-liqpay.md §5, §12).
 *
 * Shaped after {@link NovaPoshtaClient}: credentials read once from config, an
 * `@Optional()` injectable base URL so specs can point it at a stub instead of
 * the real API, {@link isConfigured} for callers that must degrade gracefully,
 * and a loud {@link ServiceUnavailableException} when asked to work without keys
 * — never a silent no-op, because a payment that quietly does nothing looks
 * exactly like a payment that worked.
 */
@Injectable()
export class LiqPayAdapter implements PaymentProvider {
  readonly key = LIQPAY_PROVIDER_KEY;

  private readonly publicKey?: string;
  private readonly privateKey?: string;
  private readonly sandbox: boolean;
  private readonly paytypes: string;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @Optional() private readonly apiUrl: string = LIQPAY_API_URL,
  ) {
    this.logger.setContext(LiqPayAdapter.name);
    this.publicKey = this.config.get<string>('LIQPAY_PUBLIC_KEY');
    this.privateKey = this.config.get<string>('LIQPAY_PRIVATE_KEY');
    this.sandbox = this.config.get<string>('LIQPAY_SANDBOX') === 'true';
    this.paytypes = this.config.get<string>('LIQPAY_PAYTYPES', DEFAULT_PAYTYPES);

    if (this.sandbox && this.config.get<string>('NODE_ENV') === 'production') {
      // Not fatal — a staging stack legitimately runs NODE_ENV=production with
      // sandbox keys — but it must be impossible to discover this by accident
      // while reconciling a month of "paid" orders against an empty bank ledger.
      this.logger.warn(
        { event: 'payment.liqpay.sandbox_in_production' },
        'LIQPAY_SANDBOX=true while NODE_ENV=production — LiqPay "sandbox" statuses will be ' +
          'accepted as successful payments. Correct this before taking real money.',
      );
    }
  }

  /** True when both keys are present. Checkout offers card payment only if so. */
  isConfigured(): boolean {
    return Boolean(this.publicKey && this.privateKey);
  }

  /** Whether we are configured for test mode — decides what `sandbox` means. */
  isSandbox(): boolean {
    return this.sandbox;
  }

  /**
   * Build the signed handoff for the hosted checkout page.
   *
   * `order_id` is the caller's `paymentId` — our {@link Payment} row id, never
   * `Order.id`. LiqPay refuses a second payment under an `order_id` it has seen,
   * so sending the order id would burn it on the first declined card and leave
   * the customer permanently unable to pay (docs/payments-liqpay.md §3).
   *
   * No network call happens here: the browser POSTs the form itself.
   */
  // `async` so an unconfigured adapter REJECTS rather than throwing
  // synchronously — a caller that only wired up `.catch()` would otherwise see
  // the exception escape as an unhandled error. Same for `parseCallback`.
  async createCheckout(params: CreateCheckoutParams): Promise<HostedCheckoutHandoff> {
    const privateKey = this.requireKeys();

    const payload: Record<string, unknown> = {
      version: LIQPAY_API_VERSION,
      public_key: this.publicKey,
      action: 'pay',
      amount: params.amount,
      currency: params.currency,
      description: params.description,
      order_id: params.paymentId,
      result_url: params.resultUrl,
      server_url: params.callbackUrl,
      paytypes: this.paytypes,
      ...(this.sandbox ? { sandbox: '1' } : {}),
    };

    const data = this.encode(payload);

    this.logger.info(
      {
        event: 'payment.liqpay.checkout_created',
        paymentId: params.paymentId,
        sandbox: this.sandbox,
      },
      'LiqPay checkout handoff built',
    );

    return {
      url: LIQPAY_CHECKOUT_URL,
      method: 'POST',
      fields: { data, signature: signLiqPayData(data, privateKey) },
    };
  }

  /**
   * Verify a callback's signature and translate it.
   *
   * Returns null — never throws — for anything that fails verification, so the
   * controller has exactly one "reject it" path. The signature is checked BEFORE
   * the payload is decoded or trusted for anything: `data` is attacker-supplied
   * until proven otherwise.
   */
  async parseCallback(body: unknown): Promise<PaymentEventInput | null> {
    const privateKey = this.requireKeys();

    const { data, signature } = (body ?? {}) as { data?: unknown; signature?: unknown };
    if (typeof data !== 'string' || typeof signature !== 'string') {
      return null;
    }

    if (!verifyLiqPaySignature(data, signature, privateKey)) {
      this.logger.warn(
        { event: 'payment.liqpay.callback.bad_signature' },
        'LiqPay callback rejected: signature mismatch',
      );
      return null;
    }

    const decoded = this.decode(data);
    if (!decoded) {
      this.logger.warn(
        { event: 'payment.liqpay.callback.undecodable' },
        'LiqPay callback rejected: signature verified but payload is not JSON',
      );
      return null;
    }

    return this.toEvent(decoded);
  }

  /**
   * Ask LiqPay what it thinks a payment's state is (`action: "status"`).
   *
   * The reconcile worker's safety net. Returns null when LiqPay cannot be
   * reached, answers with an error envelope, or reports on something we cannot
   * identify — a failed poll must leave the attempt PENDING for the next tick,
   * never be mistaken for a decision.
   */
  async fetchStatus(paymentId: string): Promise<PaymentEventInput | null> {
    const body = await this.request({ action: 'status', order_id: paymentId });
    if (!body) return null;

    // LiqPay echoes our order_id back; if it did not, trust ours rather than
    // silently attributing someone else's transaction to this payment.
    return this.toEvent({ ...body, order_id: body.order_id ?? paymentId });
  }

  /**
   * Request a refund (`action: "refund"`), full or partial.
   *
   * Returns nothing on success ON PURPOSE. REFUNDED is set by the `reversed`
   * callback that follows, not by this response — same rule as everywhere else
   * here: the provider's asynchronous notification is what moves our state
   * (docs/payments-liqpay.md §3.11). Throws so the admin sees a real failure
   * (no rights on the key, payment too old) instead of a button that lies.
   */
  async refund(params: { paymentId: string; amount: string }): Promise<void> {
    const body = await this.request({
      action: 'refund',
      order_id: params.paymentId,
      amount: params.amount,
    });

    if (!body) {
      throw new ServiceUnavailableException('LiqPay refund request failed');
    }

    // `reversed` (done) and `wait_reserve`/`processing` (accepted, settling) are
    // all successful acceptances. Anything else is a refusal we must surface.
    const status = String(body.status ?? '');
    const accepted = ['reversed', 'wait_reserve', 'processing', 'success'].includes(status);

    if (!accepted) {
      const reason = String((body.err_description ?? body.description ?? status) || 'unknown');
      this.logger.error(
        { event: 'payment.liqpay.refund.refused', paymentId: params.paymentId, status },
        'LiqPay refused the refund',
      );
      throw new ServiceUnavailableException(`LiqPay refused the refund: ${reason}`);
    }

    this.logger.info(
      { event: 'payment.liqpay.refund.accepted', paymentId: params.paymentId, status },
      'LiqPay accepted the refund; awaiting the reversed callback',
    );
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /**
   * Translate a decoded LiqPay body into our vocabulary.
   *
   * `amount`/`currency` are carried through unmapped: the caller compares them
   * against what the Payment row was created with and rejects a mismatch.
   */
  private toEvent(body: LiqPayCallbackBody): PaymentEventInput | null {
    const paymentId = typeof body.order_id === 'string' ? body.order_id : '';
    const providerStatus = typeof body.status === 'string' ? body.status : '';

    if (!paymentId || !providerStatus) {
      this.logger.warn(
        { event: 'payment.liqpay.event.unidentifiable' },
        'LiqPay payload carries no order_id/status — cannot attribute it to a payment',
      );
      return null;
    }

    const failureCode = body.err_code ?? body.code;
    const failureMessage = body.err_description ?? body.description;

    return {
      paymentId,
      providerStatus,
      // LiqPay's own id. Empty string rather than undefined: it is part of the
      // idempotency unique key, and in Postgres two NULLs never collide.
      providerPaymentId: String(body.payment_id ?? body.liqpay_order_id ?? ''),
      outcome: mapLiqPayStatus(providerStatus, this.sandbox),
      amount: body.amount === undefined || body.amount === null ? '' : String(body.amount),
      currency: typeof body.currency === 'string' ? body.currency : '',
      ...(failureCode !== undefined ? { failureCode: String(failureCode) } : {}),
      ...(failureMessage !== undefined ? { failureMessage: String(failureMessage) } : {}),
      payload: body as Record<string, unknown>,
    };
  }

  /**
   * POST a signed `data`/`signature` pair to `/api/request` and return the
   * decoded JSON, or null on any transport/protocol failure (logged, not thrown
   * — the reconcile worker retries on the next tick and must not die on a blip).
   */
  private async request(payload: Record<string, unknown>): Promise<LiqPayCallbackBody | null> {
    const privateKey = this.requireKeys();

    const data = this.encode({
      version: LIQPAY_API_VERSION,
      public_key: this.publicKey,
      ...payload,
    });

    const action = String(payload.action);

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data, signature: signLiqPayData(data, privateKey) }),
      });
    } catch (err) {
      this.logger.error(
        { event: 'payment.liqpay.request.failed', action, err },
        'LiqPay unreachable',
      );
      return null;
    }

    if (!response.ok) {
      this.logger.error(
        { event: 'payment.liqpay.request.http_error', action, status: response.status },
        'LiqPay returned a non-OK HTTP status',
      );
      return null;
    }

    try {
      return (await response.json()) as LiqPayCallbackBody;
    } catch (err) {
      this.logger.error(
        { event: 'payment.liqpay.request.unparsable', action, err },
        'LiqPay response was not JSON',
      );
      return null;
    }
  }

  /** JSON → base64, the `data` half of every LiqPay message. */
  private encode(payload: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  }

  /** base64 → JSON object, or null if it is not one. */
  private decode(data: string): LiqPayCallbackBody | null {
    try {
      const parsed: unknown = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as LiqPayCallbackBody)
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Assert credentials are present, returning the private key.
   *
   * Loud on purpose: without keys there is no such thing as a partially working
   * payment, and a 503 at the call site is far cheaper to diagnose than an
   * unsigned request LiqPay rejects with its own opaque error.
   */
  private requireKeys(): string {
    if (!this.publicKey || !this.privateKey) {
      throw new ServiceUnavailableException(
        'LiqPay is not configured (LIQPAY_PUBLIC_KEY / LIQPAY_PRIVATE_KEY missing)',
      );
    }
    return this.privateKey;
  }
}
