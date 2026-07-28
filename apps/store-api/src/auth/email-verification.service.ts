import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { randomBytes } from 'crypto';
import { AuthRepository } from './auth.repository';
import { MailOutboxService } from '../mail-outbox/mail-outbox.service';

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
    private readonly mailOutboxService: MailOutboxService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EmailVerificationService.name);
    this.expiration = this.config.get<string>(
      'EMAIL_VERIFICATION_TOKEN_EXPIRATION',
      DEFAULT_EXPIRATION,
    );
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
    const expiresAt = new Date(Date.now() + this.parseExpirationToMs(this.expiration));

    await this.authRepository.saveEmailVerificationToken(user.id, user.email, rawToken, expiresAt);

    await this.mailOutboxService.enqueueEmailVerification({
      to: user.email,
      verifyUrl: `${this.storeClientUrl}/verify-email?token=${rawToken}`,
      expiresInHuman: this.formatExpirationHuman(this.expiration),
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
   * @throws BadRequestException with a single generic message for every failure.
   */
  async confirm(rawToken: string): Promise<{ email: string }> {
    const stored = await this.authRepository.findEmailVerificationToken(rawToken);

    const isInvalid =
      !stored ||
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

    return { email: stored.email };
  }

  /** Parse "24h" / "30m" into milliseconds; falls back to 24h. */
  private parseExpirationToMs(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 24 * 60 * 60 * 1000;
    }

    const value = parseInt(match[1], 10);
    const unitMs: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return value * unitMs[match[2]];
  }

  /** Render "24h" into Ukrainian email copy ("24 години"). */
  private formatExpirationHuman(expiration: string): string {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return expiration;
    }

    const value = parseInt(match[1], 10);
    const forms: Record<string, [string, string, string]> = {
      s: ['секунду', 'секунди', 'секунд'],
      m: ['хвилину', 'хвилини', 'хвилин'],
      h: ['годину', 'години', 'годин'],
      d: ['день', 'дні', 'днів'],
    };
    const [one, few, many] = forms[match[2]];

    const mod10 = value % 10;
    const mod100 = value % 100;
    let word = many;
    if (mod10 === 1 && mod100 !== 11) {
      word = one;
    } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      word = few;
    }

    return `${value} ${word}`;
  }
}
