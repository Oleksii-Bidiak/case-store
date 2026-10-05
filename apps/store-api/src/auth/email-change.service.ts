import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { randomBytes } from 'crypto';
import { EmailTokenPurpose, Prisma } from '@prisma/client';
import { AuthRepository, type EmailVerificationTokenWithUser } from './auth.repository';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { humanizeDuration, parseDurationToMs } from './duration.util';
import { NotificationOutboxService } from '../notification-outbox';

/** Bytes of entropy for each opaque link (→ 64 hex chars), as for every other link. */
const TOKEN_BYTES = 32;

/** Lifetime of the confirm link to the NEW address — same knob as verification. */
const DEFAULT_CONFIRM_EXPIRATION = '24h';

/**
 * How long the revert link in the OLD inbox keeps working.
 *
 * Longer than the confirm link on purpose. The confirm link only has to outlive
 * the requester's own trip to their inbox; the revert link has to outlive the
 * time it takes a victim to NOTICE — a stolen session is used on a Friday night,
 * the owner reads their mail on Monday. Seven days covers a week of not looking;
 * after that the way back is the operator (the owner-only route on the customer
 * card).
 */
const REVERT_EXPIRATION = '7d';

/** One message for every confirm/revert failure — see EmailVerificationService. */
const INVALID_LINK_MESSAGE = 'Invalid or expired link';

/** The new address already belongs to somebody — at request OR at confirm. */
const EMAIL_TAKEN_MESSAGE = 'This email address is already registered to another account';

/**
 * Changing the address an account signs in with (TASK-396).
 *
 * The owner's decision of 2026-08-27, which this class implements to the letter:
 *
 *   1. its OWN route, never a profile edit (the profile refuses it — TASK-372);
 *   2. the CURRENT PASSWORD is required, as for a password change;
 *   3. the new address is PROVEN by a link sent to it BEFORE it becomes the
 *      login — until the click nothing about the account changes;
 *   4. a warning with a REVERT link goes to the OLD address — the defence
 *      against a stolen session, which has everything but that inbox;
 *   5. applying the change signs out every session (as `AuthService.setPassword`);
 *   6. uniqueness is checked AGAIN when the link is clicked — the address may
 *      have been registered by someone else in the meantime.
 *
 * And the operator's half ({@link changeByOperator}): the address is changed on
 * the customer's word, but NOT marked proven — a verification link goes to the
 * new address, and "verified" keeps meaning "someone clicked a link in that inbox".
 */
@Injectable()
export class EmailChangeService {
  private readonly confirmExpiration: string;
  private readonly storeClientUrl: string;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly authService: AuthService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly mailOutboxService: NotificationOutboxService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EmailChangeService.name);
    this.confirmExpiration = this.config.get<string>(
      'EMAIL_VERIFICATION_TOKEN_EXPIRATION',
      DEFAULT_CONFIRM_EXPIRATION,
    );
    parseDurationToMs(this.confirmExpiration); // fail the boot, not the request (TASK-790)
    this.storeClientUrl = this.config.get<string>('STORE_CLIENT_URL', 'http://localhost:3000');
  }

  /**
   * Ask to change the signed-in user's login to `newEmail` (normalised by the DTO).
   *
   * Nothing about the account changes here. Two letters go out: the confirm link
   * to the new address and the warning with the revert link to the old one.
   *
   * @throws UnauthorizedException — wrong password (the same generic 401 as every
   *   password challenge), or an account that is banned/deleted.
   * @throws BadRequestException — the new address is the current one.
   * @throws ConflictException — the new address belongs to another account.
   */
  async requestChange(userId: string, newEmail: string, currentPassword: string): Promise<void> {
    const user = await this.authService.verifyOwnPassword(userId, currentPassword, {
      event: 'user.emailChangeRejected',
      message: 'Address change rejected — current password did not match',
    });

    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (newEmail === user.email) {
      throw new BadRequestException('This is already your email address');
    }

    // Checked AFTER the password, so an attacker holding only a stolen access
    // token cannot use this route to ask "is this address registered?". The
    // registration form already answers that question to anyone, so for the
    // account holder the 409 reveals nothing new.
    if (await this.authRepository.findByEmail(newEmail)) {
      throw new ConflictException(EMAIL_TAKEN_MESSAGE);
    }

    // One pending change at a time. Earlier REVERT links stay live on purpose:
    // they are the old inbox's way back, and a second request must not be a
    // way to silence the first warning.
    await this.authRepository.invalidateActiveEmailVerificationTokens(user.id, [
      EmailTokenPurpose.EMAIL_CHANGE,
    ]);

    const confirmToken = randomBytes(TOKEN_BYTES).toString('hex');
    const revertToken = randomBytes(TOKEN_BYTES).toString('hex');
    const now = Date.now();

    await this.authRepository.saveEmailVerificationToken(
      user.id,
      newEmail,
      confirmToken,
      new Date(now + parseDurationToMs(this.confirmExpiration)),
      { purpose: EmailTokenPurpose.EMAIL_CHANGE, previousEmail: user.email },
    );
    await this.authRepository.saveEmailVerificationToken(
      user.id,
      user.email,
      revertToken,
      new Date(now + parseDurationToMs(REVERT_EXPIRATION)),
      { purpose: EmailTokenPurpose.EMAIL_CHANGE_REVERT, previousEmail: user.email },
    );

    await this.mailOutboxService.enqueueEmailChangeConfirm({
      to: newEmail,
      confirmUrl: `${this.storeClientUrl}/confirm-email-change?token=${confirmToken}`,
      expiresInHuman: humanizeDuration(this.confirmExpiration),
    });
    await this.mailOutboxService.enqueueEmailChangeNotice({
      to: user.email,
      newEmail,
      revertUrl: `${this.storeClientUrl}/revert-email-change?token=${revertToken}`,
      revertExpiresInHuman: humanizeDuration(REVERT_EXPIRATION),
    });

    // Never log a raw token, a link, or either address.
    this.logger.info(
      { event: 'user.emailChangeRequested', userId: user.id },
      'Email address change requested',
    );
  }

  /**
   * Apply a change from the link in the NEW inbox. Public — the click comes from
   * a mail client with no session.
   *
   * @returns the address that is now the login.
   * @throws BadRequestException — one generic message for a link that is unknown,
   *   used, expired, of another purpose, owned by a banned/deleted account, or
   *   stale (the account's address moved since the request).
   * @throws ConflictException — the address was registered by someone else since.
   */
  async confirmChange(rawToken: string): Promise<{ email: string }> {
    const stored = await this.findLive(rawToken, EmailTokenPurpose.EMAIL_CHANGE);

    // The change was requested FROM `previousEmail`. If the account has moved
    // since — reverted from the old inbox, or changed by an operator — this link
    // describes a request that no longer applies.
    if (stored.user.email !== stored.previousEmail) {
      await this.authRepository.markEmailVerificationTokenUsed(stored.id);
      this.logger.warn(
        { event: 'user.emailChangeStale', userId: stored.user.id },
        'Address-change link refers to an address the account no longer has',
      );
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }

    // Re-checked NOW (decision point 6): a day may have passed since the request.
    const holder = await this.authRepository.findByEmail(stored.email);
    if (holder && holder.id !== stored.user.id) {
      throw new ConflictException(EMAIL_TAKEN_MESSAGE);
    }

    await this.guardUniqueRace(() =>
      this.authRepository.applyEmailChange({
        userId: stored.user.id,
        tokenId: stored.id,
        newEmail: stored.email,
        verifiedAt: new Date(),
      }),
    );

    this.logger.info(
      { event: 'user.emailChanged', userId: stored.user.id },
      'Email address changed; all sessions revoked',
    );

    return { email: stored.email };
  }

  /**
   * "This wasn't me" — from the link in the OLD inbox. Cancels a pending change,
   * or restores the old address if the change was already confirmed, and signs
   * out every session either way. Public, like confirm.
   *
   * @returns the address that is the login after the revert.
   * @throws BadRequestException — generic, for an unusable link.
   * @throws ConflictException — the old address was taken by a new account in the
   *   meantime; only an operator can sort that out.
   */
  async revertChange(rawToken: string): Promise<{ email: string }> {
    const stored = await this.findLive(rawToken, EmailTokenPurpose.EMAIL_CHANGE_REVERT);
    const restoreEmail = stored.previousEmail ?? stored.email;

    if (stored.user.email !== restoreEmail) {
      const holder = await this.authRepository.findByEmail(restoreEmail);
      if (holder && holder.id !== stored.user.id) {
        throw new ConflictException(
          'The previous address has since been registered to another account — contact support',
        );
      }
    }

    await this.guardUniqueRace(() =>
      this.authRepository.revertEmailChange({
        userId: stored.user.id,
        tokenId: stored.id,
        restoreEmail,
        verifiedAt: new Date(),
      }),
    );

    // `warn`, not `info`: somebody said a change on their account was not theirs.
    this.logger.warn(
      { event: 'user.emailChangeReverted', userId: stored.user.id },
      'Email address change reverted from the old inbox; all sessions revoked',
    );

    return { email: restoreEmail };
  }

  /**
   * The operator's half (TASK-396): the customer lost their inbox and asked the
   * shop for help. The caller — `UserService` — has already resolved the target
   * as a customer and checked who may act; this applies the change.
   *
   * The new address is NOT marked verified. A verification link goes to it, and
   * "підтверджено" appears only when someone clicks it from that inbox — the
   * invariant "verified = proven" survives an operator typing an address in.
   *
   * @throws BadRequestException — the new address is the current one.
   * @throws ConflictException — the new address belongs to another account.
   */
  async changeByOperator(user: { id: string; email: string }, newEmail: string): Promise<void> {
    if (newEmail === user.email) {
      throw new BadRequestException('This is already the customer’s email address');
    }

    if (await this.authRepository.findByEmail(newEmail)) {
      throw new ConflictException(EMAIL_TAKEN_MESSAGE);
    }

    await this.guardUniqueRace(() => this.authRepository.setUnverifiedEmail(user.id, newEmail));

    // Goes to the NEW address: `requestVerification` reads the account's current
    // address, which the line above just set, and it is unverified by then.
    await this.emailVerificationService.requestVerification(user.id);

    this.logger.info(
      { event: 'user.emailChangedByOperator', userId: user.id },
      'Email address changed by an operator; verification sent to the new address',
    );
  }

  /** A live link of exactly this purpose, or the generic 400. */
  private async findLive(
    rawToken: string,
    purpose: EmailTokenPurpose,
  ): Promise<EmailVerificationTokenWithUser> {
    const stored = await this.authRepository.findEmailVerificationToken(rawToken);

    const isInvalid =
      !stored ||
      stored.purpose !== purpose ||
      Boolean(stored.usedAt) ||
      stored.expiresAt < new Date() ||
      !stored.user.isActive ||
      Boolean(stored.user.deletedAt);

    if (isInvalid || !stored) {
      this.logger.warn({ event: 'user.emailChangeLinkRejected', purpose }, 'Link rejected');
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }

    return stored;
  }

  /**
   * The uniqueness check above and the write are two statements, so an address
   * can still be registered between them. The unique index catches it (P2002);
   * answer that as the same 409 the explicit check gives, not as a 500.
   */
  private async guardUniqueRace(write: () => Promise<void>): Promise<void> {
    try {
      await write();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(EMAIL_TAKEN_MESSAGE);
      }
      throw error;
    }
  }
}
