import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * Stable, machine-readable error codes for discount validation failures.
 *
 * These travel to the client in the HTTP error envelope's `error` field (see
 * {@link HttpExceptionFilter}, which surfaces `resp.error`). The storefront keys
 * its localized messages off these codes — keep the string values stable.
 */
export const DiscountErrorCode = {
  /** No active discount exists for the supplied code. */
  NOT_FOUND: 'DISCOUNT_NOT_FOUND',
  /** The code exists but has been deactivated by an admin. */
  INACTIVE: 'DISCOUNT_INACTIVE',
  /** The code's `startsAt` window has not opened yet. */
  NOT_STARTED: 'DISCOUNT_NOT_STARTED',
  /** The code's `expiresAt` window has passed. */
  EXPIRED: 'DISCOUNT_EXPIRED',
  /** The cart subtotal is below the code's `minSpend` threshold. */
  MIN_SPEND_NOT_MET: 'DISCOUNT_MIN_SPEND_NOT_MET',
  /** The global `maxRedemptions` cap has been reached. */
  MAX_REDEMPTIONS_REACHED: 'DISCOUNT_MAX_REDEMPTIONS_REACHED',
  /** The caller has already redeemed this code up to its `perUserLimit`. */
  USER_LIMIT_REACHED: 'DISCOUNT_USER_LIMIT_REACHED',
} as const;

export type DiscountErrorCode = (typeof DiscountErrorCode)[keyof typeof DiscountErrorCode];

/**
 * Build a 400 BadRequest carrying a stable discount error code. Used for
 * eligibility failures the customer can fix (wrong/expired code, min-spend not
 * met). The `error` field is the stable code; `message` is a human hint.
 */
export function badDiscount(code: DiscountErrorCode, message: string): BadRequestException {
  return new BadRequestException({ error: code, message });
}

/**
 * Build a 409 Conflict carrying a stable discount error code. Used for
 * cap-exhaustion failures (global or per-user redemption limits) — the code is
 * valid but no longer usable, which is a state conflict rather than bad input.
 */
export function conflictDiscount(code: DiscountErrorCode, message: string): ConflictException {
  return new ConflictException({ error: code, message });
}
