import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * Stable, machine-readable error codes of the checkout sign-up (TASK-2010).
 *
 * They reach the client through the HTTP error envelope's `error` field (see
 * `HttpExceptionFilter`, which surfaces only `error` and `message`); the
 * storefront keys its Ukrainian copy off these strings, so keep them stable.
 */
export const CheckoutAccountErrorCode = {
  /**
   * The address already has an account — any account row (a deactivated one
   * included), exactly as `POST /auth/register` decides it. Answered
   * by `POST /orders` with `contact.createAccount: true` and by
   * `POST /orders/guest/{token}/account`; the storefront offers to sign in
   * instead. Never a second account on one address (B-12 тема 2 (б)).
   */
  ACCOUNT_EXISTS: 'ACCOUNT_EXISTS',
  /**
   * The «Задайте пароль» link is unknown, used, expired, of another purpose, for
   * an address the account has left, or its account is banned/deleted — one code
   * for all of them, so a random token learns nothing about any account.
   */
  ACCOUNT_SETUP_INVALID: 'ACCOUNT_SETUP_INVALID',
} as const;

export type CheckoutAccountErrorCode =
  (typeof CheckoutAccountErrorCode)[keyof typeof CheckoutAccountErrorCode];

/** 409 — the address already has an account; sign in instead. */
export function accountExistsError(): ConflictException {
  return new ConflictException({
    error: CheckoutAccountErrorCode.ACCOUNT_EXISTS,
    // Shopper-facing: the storefront may show it verbatim, like the delivery codes.
    message: 'На цю пошту вже є акаунт — увійдіть, щоб продовжити',
  });
}

/** 400 — the setup link cannot be used (deliberately one generic answer). */
export function accountSetupInvalidError(): BadRequestException {
  return new BadRequestException({
    error: CheckoutAccountErrorCode.ACCOUNT_SETUP_INVALID,
    message: 'Посилання недійсне або застаріло — попросіть новий лист',
  });
}
