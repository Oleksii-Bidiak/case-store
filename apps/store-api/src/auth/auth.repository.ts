import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma';
import {
  User,
  RefreshToken,
  PasswordResetToken,
  EmailVerificationToken,
  OAuthAccount,
  OAuthProvider,
  UserRole,
} from '@prisma/client';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
}

export interface CreateOAuthUserInput {
  email: string;
  firstName?: string;
  lastName?: string;
  provider: OAuthProvider;
  providerId: string;
}

export interface OAuthAccountWithUser extends OAuthAccount {
  user: User;
}

export interface RefreshTokenWithUser extends RefreshToken {
  user: User;
}

export interface PasswordResetTokenWithUser extends PasswordResetToken {
  user: User;
}

export interface EmailVerificationTokenWithUser extends EmailVerificationToken {
  user: User;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Hash a refresh token using SHA-256 before storing or looking up.
   * This ensures that even if the database is compromised,
   * attackers cannot use the stored values to impersonate users.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Find a user by email address.
   * Returns the user record or null if not found.
   */
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /**
   * Find a user by ID.
   * Returns the user record or null if not found.
   */
  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Create a new user with the provided data.
   * Returns the newly created user record.
   */
  createUser(data: CreateUserInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  /**
   * Find a refresh token by its raw value, including the associated user.
   * The token is hashed before lookup — only the hash is stored in the database.
   * Returns the token record with user relation or null if not found.
   */
  findRefreshToken(rawToken: string): Promise<RefreshTokenWithUser | null> {
    return this.prisma.refreshToken.findUnique({
      where: { token: this.hashToken(rawToken) },
      include: { user: true },
    });
  }

  /**
   * Persist a new refresh token for a user.
   * The token is hashed (SHA-256) before storage — the raw token is never saved.
   * Returns the created refresh token record (with hashed token).
   */
  saveRefreshToken(userId: string, rawToken: string, expiresAt: Date): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({
      data: {
        token: this.hashToken(rawToken),
        userId,
        expiresAt,
      },
    });
  }

  /**
   * Revoke a single refresh token by setting isRevoked = true.
   */
  async revokeToken(id: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { isRevoked: true },
    });
  }

  /**
   * Revoke all refresh tokens for a given user.
   * Sets isRevoked = true on every non-revoked token belonging to the user.
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  /**
   * Persist a new password-reset token for a user.
   * The token is hashed (SHA-256) before storage — the raw token is never saved,
   * reusing the same {@link hashToken} at-rest protection as refresh tokens.
   * Returns the created row (with the hashed token).
   */
  savePasswordResetToken(
    userId: string,
    rawToken: string,
    expiresAt: Date,
  ): Promise<PasswordResetToken> {
    return this.prisma.passwordResetToken.create({
      data: {
        token: this.hashToken(rawToken),
        userId,
        expiresAt,
      },
    });
  }

  /**
   * Find a password-reset token by its raw value, including the associated user.
   * The token is hashed before lookup — only the hash is stored in the database.
   * Returns the row with user relation or null if not found.
   */
  findPasswordResetToken(rawToken: string): Promise<PasswordResetTokenWithUser | null> {
    return this.prisma.passwordResetToken.findUnique({
      where: { token: this.hashToken(rawToken) },
      include: { user: true },
    });
  }

  /**
   * Mark a single password-reset token as used (single-use enforcement).
   * Sets `usedAt = now` on the row identified by id.
   */
  async markPasswordResetTokenUsed(id: string): Promise<void> {
    await this.prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  /**
   * Invalidate every still-active (unused, unexpired) password-reset token for a
   * user by marking them used. Called before issuing a fresh token so only the
   * most recent reset link is honorable (one active token per user at a time).
   */
  async invalidateActivePasswordResetTokens(userId: string): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
  }

  // ─── Email verification (TASK-342) ─────────────────────────────────────────
  //
  // Same at-rest shape as PasswordResetToken: SHA-256 of the raw token, an
  // explicit expiry, and a `usedAt` stamp that makes it single-use. The one
  // structural difference is `email` on the row — the address the link PROVES,
  // captured at issue time. See EmailVerificationService.confirm for why that
  // is not the same thing as the user's current address.

  /**
   * Persist a verification token for a specific address. The token is hashed
   * before storage; the raw value only ever exists in the outgoing link.
   */
  saveEmailVerificationToken(
    userId: string,
    email: string,
    rawToken: string,
    expiresAt: Date,
  ): Promise<EmailVerificationToken> {
    return this.prisma.emailVerificationToken.create({
      data: { token: this.hashToken(rawToken), userId, email, expiresAt },
    });
  }

  /** Look up a verification token by its raw value, with the owning user. */
  findEmailVerificationToken(rawToken: string): Promise<EmailVerificationTokenWithUser | null> {
    return this.prisma.emailVerificationToken.findUnique({
      where: { token: this.hashToken(rawToken) },
      include: { user: true },
    });
  }

  /** Mark one verification token used (single-use enforcement). */
  async markEmailVerificationTokenUsed(id: string): Promise<void> {
    await this.prisma.emailVerificationToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  /**
   * Invalidate every still-active verification token for a user, so only the
   * most recent link is honorable. Called before issuing a fresh one — and, as
   * a side effect, the reason a link for an old address stops working the
   * moment a new one is requested.
   */
  async invalidateActiveEmailVerificationTokens(userId: string): Promise<void> {
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
  }

  /** Stamp the address as proven, at `verifiedAt`. */
  async markEmailVerified(userId: string, verifiedAt: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: verifiedAt },
    });
  }

  /**
   * Record one failed password login and return the resulting attempt counter
   * (TASK-314). The caller decides what the number means — this method only
   * moves it.
   *
   * The normal path uses Prisma's atomic `increment` rather than a
   * read-modify-write, so two simultaneous failed logins cannot lose an attempt
   * to a stale read. `restartWindow` is for the case where a previous lock has
   * already been served: the counter starts over at 1 and the spent deadline is
   * cleared, otherwise the counter would stay parked at the threshold and the
   * very next typo would re-lock the account instantly, forever.
   */
  async recordFailedLogin(userId: string, restartWindow: boolean): Promise<number> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: restartWindow
        ? { failedLoginAttempts: 1, lockedUntil: null }
        : { failedLoginAttempts: { increment: 1 } },
    });

    return user.failedLoginAttempts;
  }

  /**
   * Hold password login for this user shut until the given instant (TASK-314).
   */
  async lockLoginUntil(userId: string, until: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: until },
    });
  }

  /**
   * Clear the failed-login counter and any lock — a successful login proves the
   * caller is the owner, so the account starts from a clean slate (TASK-314).
   */
  async clearFailedLogins(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  /**
   * Update a user's password hash by user id.
   */
  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  /**
   * Delete all RefreshToken rows that are expired (`expiresAt < now`) or revoked.
   *
   * When `retentionDays` is greater than 0, revoked rows are only deleted once
   * they are older than that many days (a short audit window); expired rows are
   * always deleted regardless of the retention window. Returns the row count.
   */
  async deleteExpiredAndRevoked(now: Date, retentionDays = 0): Promise<number> {
    const revokedCondition =
      retentionDays > 0
        ? {
            isRevoked: true,
            createdAt: { lt: new Date(now.getTime() - retentionDays * 86_400_000) },
          }
        : { isRevoked: true };

    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, revokedCondition],
      },
    });

    return result.count;
  }

  /**
   * Look up an existing OAuth link by (provider, providerId) — the fast path
   * for a returning Google user, checked BEFORE any email-based lookup
   * (TASK-168). `providerId` is the provider's stable subject id (OIDC `sub`),
   * never the email.
   */
  findOAuthAccount(
    provider: OAuthProvider,
    providerId: string,
  ): Promise<OAuthAccountWithUser | null> {
    return this.prisma.oAuthAccount.findUnique({
      where: { provider_providerId: { provider, providerId } },
      include: { user: true },
    });
  }

  /**
   * Link an OAuth identity to an ALREADY-RESOLVED, already-lock-checked User.
   * The caller (AuthService) is responsible for the lock check — linking must
   * never happen before it, or a banned account could silently accumulate a
   * working OAuth sign-in path (TASK-168, plan 153 §Locked-account resolution).
   */
  linkOAuthAccount(
    userId: string,
    provider: OAuthProvider,
    providerId: string,
    email: string,
  ): Promise<OAuthAccount> {
    return this.prisma.oAuthAccount.create({
      data: { userId, provider, providerId, email },
    });
  }

  /**
   * Brand-new signup via OAuth: no matching User by providerId OR email exists
   * yet. Creates the User (no passwordHash — a Google-only account genuinely
   * has no password) and its OAuthAccount link atomically in one transaction:
   * two tables must succeed together here.
   *
   * The role is pinned explicitly to CUSTOMER (TASK-314) rather than left to the
   * schema default: an account created by whoever controls a Google inbox must
   * never be able to arrive privileged, whatever that default becomes later.
   */
  createUserFromOAuth(
    input: CreateOAuthUserInput,
  ): Promise<{ user: User; oauthAccount: OAuthAccount }> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          role: UserRole.CUSTOMER,
        },
      });

      const oauthAccount = await tx.oAuthAccount.create({
        data: {
          userId: user.id,
          provider: input.provider,
          providerId: input.providerId,
          email: input.email,
        },
      });

      return { user, oauthAccount };
    });
  }
}
