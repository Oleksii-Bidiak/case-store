import { BadRequestException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { randomBytes } from 'crypto';
import { EmailTokenPurpose } from '@prisma/client';
import { AuthRepository } from './auth.repository';
import { humanizeDuration, parseDurationToMs } from './duration.util';
import { NotificationOutboxService } from '../notification-outbox';
import { GUEST_ORDER_CLAIM_PORT, type GuestOrderClaimPort } from '../common/ports';

/** Bytes of entropy for an opaque verification token (→ 64 hex chars). */
const VERIFICATION_TOKEN_BYTES = 32;

/** Default lifetime of a verification link. */
const DEFAULT_EXPIRATION = '24h';

/**
 * One generic message for every confirm failure — not found, already used,
 * expired, banned owner, or an address that has since changed. Distinguishing
 * them would let anyone holding a random token learn facts about accounts they
 * do not own, and the honest user's next step is the same in every case: ask
 * for a fresh link.
 */
const INVALID_VERIFICATION_TOKEN_MESSAGE = 'Invalid or expired verification link';

/**
 * Email verification (TASK-342).
 *
 * The token flow mirrors `PasswordResetToken` exactly — SHA-256 at rest, an
 * explicit expiry, single-use via `usedAt` — with one addition that is the
 * entire point of the design:
 *
 * **THE ADDRESS BEING PROVEN LIVES ON THE TOKEN, NOT ON THE USER.**
 *
 * Consider: a user asks to verify `old@example.com`; while that mail is in
 * flight they change their address to `new@example.com`; then they click the
 * old link. If `confirm` simply stamped `emailVerifiedAt`, the store would now
 * claim `new@example.com` is verified on the strength of someone having proved
 * `old@example.com`. That is a way to get an unproven — possibly someone else's
 * — address marked as proven, using a link that was legitimately issued. So the
 * token's `email` is compared against the account's current address and a
 * mismatch is refused.
 */
@Injectable()
export class EmailVerificationService {
  private readonly expiration: string;
  private readonly storeClientUrl: string;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly mailOutboxService: NotificationOutboxService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    // TASK-485: used to reach the order side WITHOUT importing OrderModule —
    // see `guest-order-claim.port.ts` for the cycle that would otherwise form.
    private readonly moduleRef: ModuleRef,
  ) {
    this.logger.setContext(EmailVerificationService.name);
    this.expiration = this.config.get<string>(
      'EMAIL_VERIFICATION_TOKEN_EXPIRATION',
      DEFAULT_EXPIRATION,
    );
    // Fail the boot, not the first verification request, on an unreadable value
    // (TASK-790). There is no fallback any more — the old one was 24 hours here
    // and 7 days in AuthService.
    parseDurationToMs(this.expiration);
    this.storeClientUrl = this.config.get<string>('STORE_CLIENT_URL', 'http://localhost:3000');
  }

  /**
   * Issue a fresh verification link for the signed-in user's CURRENT address.
   *
   * Resolves silently when there is nothing to do (no such user, banned,
   * tombstoned, or already verified) so the endpoint can always answer 200 with
   * the same generic message — no enumeration, and no way to spray mail at an
   * address by repeatedly "verifying" it.
   */
  async requestVerification(userId: string): Promise<void> {
    const user = await this.authRepository.findById(userId);

    if (!user || !user.isActive || user.deletedAt || user.emailVerifiedAt) {
      return;
    }

    // Only the most recent link stays valid. This also means a link issued for
    // a previous address stops working the moment a new one is requested.
    await this.authRepository.invalidateActiveEmailVerificationTokens(user.id);

    const rawToken = randomBytes(VERIFICATION_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + parseDurationToMs(this.expiration));

    await this.authRepository.saveEmailVerificationToken(user.id, user.email, rawToken, expiresAt);

    await this.mailOutboxService.enqueueEmailVerification({
      to: user.email,
      verifyUrl: `${this.storeClientUrl}/verify-email?token=${rawToken}`,
      expiresInHuman: humanizeDuration(this.expiration),
    });

    // Never log the raw token or the link.
    this.logger.info(
      { event: 'user.emailVerificationRequested', userId: user.id },
      'Email verification requested',
    );
  }

  /**
   * Confirm a verification token. Public — the click arrives from an email
   * client with no session.
   *
   * ── TASK-485: this is where guest orders become yours ─────────────────────
   * Confirming is the moment the account has PROVEN it owns the address, and an
   * address is the only thing linking a guest checkout to a person. So the claim
   * runs here and nowhere earlier: at registration the same call would hand a
   * stranger's phone number, order totals and delivery address to anybody who
   * typed that stranger's email into the signup form, because signing in with an
   * unverified address is not blocked today (B-5 §5).
   *
   * @returns the proven address and how many guest orders moved onto the account
   *   (0 for the overwhelming majority — most people never ordered as a guest).
   * @throws BadRequestException with a single generic message for every failure.
   */
  async confirm(rawToken: string): Promise<{ email: string; claimedOrders: number }> {
    const stored = await this.authRepository.findEmailVerificationToken(rawToken);

    const isInvalid =
      !stored ||
      // TASK-396: an address-change link proves a DIFFERENT address from the
      // account's current one by design, so this route would refuse it below
      // anyway — and burn it on the way out. Refused up front instead, untouched,
      // so a link pasted into the wrong page still works on the right one.
      stored.purpose !== EmailTokenPurpose.VERIFY ||
      Boolean(stored.usedAt) ||
      stored.expiresAt < new Date() ||
      !stored.user.isActive ||
      Boolean(stored.user.deletedAt);

    if (isInvalid || !stored) {
      this.logger.warn(
        { event: 'user.emailVerificationRejected' },
        'Email verification token rejected',
      );
      throw new BadRequestException(INVALID_VERIFICATION_TOKEN_MESSAGE);
    }

    // The load-bearing check — see the class docblock. The token proves ONE
    // address; if the account has moved on, that proof says nothing about where
    // it moved to.
    if (stored.email !== stored.user.email) {
      // Burn the token anyway: it can never become valid again (the address it
      // proves is no longer the account's), and leaving it live is one more
      // credential in an inbox.
      await this.authRepository.markEmailVerificationTokenUsed(stored.id);

      this.logger.warn(
        { event: 'user.emailVerificationStale', userId: stored.user.id },
        'Verification link was issued for an address the account no longer uses',
      );
      throw new BadRequestException(INVALID_VERIFICATION_TOKEN_MESSAGE);
    }

    await this.authRepository.markEmailVerified(stored.user.id, new Date());
    await this.authRepository.markEmailVerificationTokenUsed(stored.id);

    this.logger.info(
      { event: 'user.emailVerified', userId: stored.user.id },
      'Email address verified',
    );

    const claimedOrders = await this.claimGuestOrders(stored.user.id, stored.email);

    return { email: stored.email, claimedOrders };
  }

  /**
   * Move this address's guest orders onto the account that has just proven it
   * (TASK-485).
   *
   * ── Why failure here is swallowed ─────────────────────────────────────────
   * The verification itself is already committed and its token already burned by
   * the time this runs, so throwing would answer 400 — "your link is invalid" —
   * to somebody whose address was in fact verified a millisecond ago, and they
   * would have no way to retry. A claim that did not happen costs the shopper a
   * tidier order list; it costs them nothing they cannot still reach, because a
   * guest order remains readable through the link emailed at checkout and
   * through the public number+phone form (TASK-483). So the outage is logged
   * loudly and the verification stands.
   *
   * Claiming is idempotent (`userId: null` is part of the WHERE), so a retry
   * from any other path can never double-claim.
   */
  private async claimGuestOrders(userId: string, email: string): Promise<number> {
    try {
      // `strict: false` searches the whole container: the provider lives in
      // OrderModule, which this module deliberately does not import.
      const claimPort = this.moduleRef.get<GuestOrderClaimPort>(GUEST_ORDER_CLAIM_PORT, {
        strict: false,
      });

      return await claimPort.claimGuestOrders(userId, email);
    } catch (error) {
      this.logger.error(
        { event: 'user.guestOrderClaimFailed', userId, err: error },
        'Email was verified but guest orders could not be claimed',
      );
      return 0;
    }
  }
}
