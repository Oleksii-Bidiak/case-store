import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { User, RefreshToken } from '@prisma/client';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
}

export interface RefreshTokenWithUser extends RefreshToken {
  user: User;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

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
   * Find a refresh token by its value, including the associated user.
   * Returns the token with user relation or null if not found.
   */
  findRefreshToken(token: string): Promise<RefreshTokenWithUser | null> {
    return this.prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  /**
   * Persist a new refresh token for a user.
   * Returns the created refresh token record.
   */
  saveRefreshToken(userId: string, token: string, expiresAt: Date): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({
      data: {
        token,
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
}
