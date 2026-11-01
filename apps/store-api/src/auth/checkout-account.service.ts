import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { EmailTokenPurpose, Prisma, UserRole } from '@prisma/client';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import type { IssuedSession } from './entities';
import { accountExistsError, accountSetupInvalidError } from './checkout-account.errors';
import { normalizeEmailAddress } from '../common/validators';

/** What the checkout knows about the buyer when it creates their account. */
export interface CheckoutAccountInput {
  email: string;
  /** The buyer's name as typed — split into first name and surname. */
  name: string | null;
  /** Absent for an operator phone order taken without one (the one-click path). */
  phone: string | null;
}

/** What finishing the account from the «Задайте пароль» link hands back. */
export interface AccountSetupResult {
  /** A fresh session for the device that opened the link. */
  session: IssuedSession;
  /** Guest orders on the proven address that moved onto the account. */
  claimedOrders: number;
}

/**
 * The account a guest creates at checkout (TASK-2010, B-12 тема 2).
 *
 * ## The life of the account
 *
 * 1. **Created with the order.** `createPasswordless` runs inside the order's
 *    own transaction (the order module hands it the `tx`), so a checkout that
 *    fails leaves no account behind. No password, no proven address.
 * 2. **Signed in at once.** `startSession` after the commit — the buyer sees
 *    their order as an account holder, and the promo code they used is
 *    redeemed against this account.
 * 3. **Finished from the letter.** `issueSetupLink` (same transaction) queues
 *    «Задайте пароль»; `confirmSetup` proves the mailbox, optionally sets a
 *    password, and only THEN moves the address's earlier guest orders over.
 *
 * ## Why the unproven account is safe to hand out
 *
 * It sees only its own new order. Somebody else's guest orders move to it only
 * after the mailbox is proven — and proving it (this link, a verification link,
 * a reset link, Google) revokes every session first, so whoever typed somebody
 * else's address loses the account before it gains anything
 * (`EmailVerificationService.adoptProvenAddress`).
 */
@Injectable()
export class CheckoutAccountService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly authService: AuthService,
    private readonly emailVerification: EmailVerificationService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CheckoutAccountService.name);
  }

  /**
   * Whether any account row holds this address — deactivated and deleted ones
   * included, exactly the lookup `register` refuses on. The owner accepted on
   * 2026-11-01 that `POST /auth/checkout/email-status` answers this out loud:
   * `/register` already reveals it through its 409, and the route is throttled
   * and fail-closed like `/register`.
   */
  async hasAccount(email: string): Promise<boolean> {
    return (await this.authRepository.findByEmail(normalizeEmailAddress(email))) !== null;
  }

  /** @throws ConflictException 409 `ACCOUNT_EXISTS` when the address is taken. */
  async assertNoAccount(email: string): Promise<void> {
    if (await this.hasAccount(email)) {
      throw accountExistsError();
    }
  }

  /**
   * Write the password-less account through the caller's transaction and return
   * its id. A sign-up racing this one on the same address loses on the unique
   * index — answered as the same 409 `ACCOUNT_EXISTS`, and the transaction
   * (order, stock, promo) rolls back with it.
   */
  async createPasswordless(
    input: CheckoutAccountInput,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const [firstName, ...surname] = (input.name ?? '').trim().split(/\s+/);

    try {
      const user = await this.authRepository.createPasswordlessUser(
        {
          email: input.email,
          firstName: firstName || undefined,
          lastName: surname.length > 0 ? surname.join(' ') : undefined,
          phone: input.phone ?? undefined,
        },
        tx,
      );
      return user.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw accountExistsError();
      }
      throw error;
    }
  }

  /** Queue the «Задайте пароль» link inside the caller's transaction. */
  issueSetupLink(user: { id: string; email: string }, tx: Prisma.TransactionClient): Promise<void> {
    return this.emailVerification.issueAccountSetupLink(user, tx);
  }

  /** Sign the new account in — an ordinary CUSTOMER token pair. */
  startSession(userId: string): Promise<IssuedSession> {
    return this.authService.generateTokenPair(userId, UserRole.CUSTOMER);
  }

  /**
   * Finish the account from the «Задайте пароль» link (`POST
   * /auth/account-setup/confirm`).
   *
   * Order, and why:
   *  1. The link must be an unused, unexpired ACCOUNT_SETUP link of a live
   *     account, for the address the account still has — every failure is the
   *     same 400 `ACCOUNT_SETUP_INVALID`; a link for an address the account has
   *     left is burned on the way out, as `EmailVerificationService.confirm` does.
   *  2. The password policy is checked before anything is written.
   *  3. The address is adopted: an unproven account has every session revoked,
   *     is stamped, and claims its guest orders.
   *  4. The password, if given, is set (Argon2 + revoke, the shared tail).
   *  5. The link is spent; THEN the session is minted — after both revokes.
   *
   * "Пропустити" on the page sends no password: the address is still proven and
   * the buyer signed in; they can set a password later through «Забули пароль?».
   */
  async confirmSetup(rawToken: string, password?: string): Promise<AccountSetupResult> {
    const stored = await this.authRepository.findEmailVerificationToken(rawToken);

    if (
      !stored ||
      stored.purpose !== EmailTokenPurpose.ACCOUNT_SETUP ||
      stored.usedAt ||
      stored.expiresAt < new Date() ||
      !stored.user.isActive ||
      stored.user.deletedAt
    ) {
      this.logger.warn({ event: 'user.accountSetupRejected' }, 'Account setup link rejected');
      throw accountSetupInvalidError();
    }

    if (stored.email !== stored.user.email) {
      await this.authRepository.markEmailVerificationTokenUsed(stored.id);
      this.logger.warn(
        { event: 'user.accountSetupStale', userId: stored.user.id },
        'Account setup link was issued for an address the account no longer uses',
      );
      throw accountSetupInvalidError();
    }

    if (password !== undefined) {
      this.authService.assertPasswordMeetsRolePolicy(stored.user.role, password);
    }

    const claimedOrders = await this.emailVerification.adoptProvenAddress(
      stored.user,
      stored.email,
    );

    if (password !== undefined) {
      await this.authService.setPassword(stored.user.id, password);
    }

    await this.authRepository.markEmailVerificationTokenUsed(stored.id);

    this.logger.info(
      {
        event: 'user.accountSetupCompleted',
        userId: stored.user.id,
        passwordSet: password !== undefined,
        claimedOrders,
      },
      'Checkout account set up',
    );

    const session = await this.authService.generateTokenPair(stored.user.id, stored.user.role);
    return { session, claimedOrders };
  }
}
