import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Machine-readable discriminators carried in the exception body's `code`.
 *
 * Both delivery failures are 503s, but they mean opposite things and demand
 * opposite responses, so callers must be able to tell them apart WITHOUT string
 * matching a message. See the class docs below.
 */
export const DELIVERY_NOT_CONFIGURED = 'DELIVERY_NOT_CONFIGURED';
export const DELIVERY_UNAVAILABLE = 'DELIVERY_UNAVAILABLE';

/**
 * The Nova Poshta integration is NOT CONFIGURED — no `NP_API_KEY`, and keyless
 * mode is either off or forbidden (production).
 *
 * This is a **deployment defect, not a runtime hiccup**. It does not heal on
 * retry, it does not depend on NP's uptime, and — critically — it is not
 * order-shaped: whoever catches this must NOT paper over it with a zero
 * shipping cost, because a zero here means the shop silently pays for delivery
 * on every single order, forever, and every downstream surface HIDES a zero
 * (the checkout summary reads `0` as "no cost yet", the order email and the
 * confirmation breakdown omit zero rows). Nobody would ever see it.
 *
 * Contrast {@link DeliveryUnavailableException}, which IS safe to swallow.
 */
export class DeliveryNotConfiguredException extends ServiceUnavailableException {
  /** Stable discriminator for `instanceof`-free checks across module boundaries. */
  readonly code = DELIVERY_NOT_CONFIGURED;

  constructor(message = 'Nova Poshta delivery is not configured') {
    super({
      statusCode: 503,
      message,
      error: 'Service Unavailable',
      code: DELIVERY_NOT_CONFIGURED,
    });
  }
}

/**
 * Nova Poshta is configured but did not answer usefully right now — the network
 * failed, it returned a non-OK status, or it answered `success: false`.
 *
 * This IS transient and IS safe to degrade around: an order must never be
 * blocked because a courier API had a bad minute. Callers may fall back to a
 * zero/absent estimate and log at `warn`.
 */
export class DeliveryUnavailableException extends ServiceUnavailableException {
  /** Stable discriminator for `instanceof`-free checks across module boundaries. */
  readonly code = DELIVERY_UNAVAILABLE;

  constructor(message = 'Nova Poshta API is unavailable') {
    super({
      statusCode: 503,
      message,
      error: 'Service Unavailable',
      code: DELIVERY_UNAVAILABLE,
    });
  }
}

/**
 * True when `err` is the not-configured failure — usable across module
 * boundaries where `instanceof` can be defeated by duplicate module instances.
 */
export function isDeliveryNotConfigured(err: unknown): err is DeliveryNotConfiguredException {
  return (
    err instanceof DeliveryNotConfiguredException ||
    (typeof err === 'object' &&
      err !== null &&
      (err as { code?: unknown }).code === DELIVERY_NOT_CONFIGURED)
  );
}
