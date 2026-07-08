import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma';
import { User, RefreshToken, PasswordResetToken } from '@prisma/client';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
}

export interface RefreshTokenWithUser extends RefreshToken {
  user: User;
}

export interface PasswordResetTokenWithUser extends PasswordResetToken {
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
}
