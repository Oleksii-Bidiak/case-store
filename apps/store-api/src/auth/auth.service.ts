import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PinoLogger } from 'nestjs-pino';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { AuthRepository, CreateUserInput } from './auth.repository';
import { AuthTokens } from './entities';
import { RegisterDto } from './dto';
import { MailOutboxService } from '../mail-outbox/mail-outbox.service';

/** Bytes of entropy for an opaque password-reset token (→ 64 hex chars). */
const PASSWORD_RESET_TOKEN_BYTES = 32;

/** Generic error message for every confirm-reset failure — never leaks which
 * specific check failed (not-found / used / expired / deactivated owner). */
const INVALID_RESET_TOKEN_MESSAGE = 'Invalid or expired reset token';

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly jwtExpiration: string;
  private readonly jwtRefreshExpiration: string;
  private readonly passwordResetExpiration: string;
  private readonly storeClientUrl: string;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailOutboxService: MailOutboxService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthService.name);

    // Secrets are required — never fall back to a default (env is validated at startup)
    this.jwtSecret = this.configService.getOrThrow<string>('JWT_SECRET');
    this.jwtRefreshSecret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.jwtExpiration = this.configService.get<string>('JWT_EXPIRATION', '15m');
    this.jwtRefreshExpiration = this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d');
    this.passwordResetExpiration = this.configService.get<string>(
      'PASSWORD_RESET_TOKEN_EXPIRATION',
      '1h',
    );
    this.storeClientUrl = this.configService.get<string>(
      'STORE_CLIENT_URL',
      'http://localhost:3000',
    );
  }

  /**
   * Register a new user.
   * Checks email uniqueness, hashes password, creates user, returns token pair.
   */
  async register(dto: RegisterDto): Promise<AuthTokens> {
    // Check if email is already taken
    const existingUser = await this.authRepository.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password with argon2
    const passwordHash = await argon2.hash(dto.password);

    // Create user
    const createUserInput: CreateUserInput = {
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
    };
    const user = await this.authRepository.createUser(createUserInput);

    // Critical business event — never log the password/hash.
    this.logger.info(
      { event: 'user.registered', userId: user.id, email: dto.email },
      'User registered',
    );

    // Generate and return token pair
    return this.generateTokenPair(user.id, user.role);
  }

  /**
   * Login with email and password.
   * Finds user, verifies password, returns token pair.
   */
  async login(email: string, password: string): Promise<AuthTokens> {
    // Find user by email
    const user = await this.authRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password with argon2
    const isPasswordValid = await argon2.verify(user.passwordHash, password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reject deactivated (banned) accounts — they must not obtain new tokens.
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Generate and return token pair
    return this.generateTokenPair(user.id, user.role);
  }

  /**
   * Refresh authentication tokens.
   * Validates stored token, checks not revoked/expired, revokes old, issues new pair.
   *
   * Security: If a revoked token is reused, this indicates a potential token theft.
   * Per RFC 6819 §5.2.2, we revoke ALL tokens for the user to terminate all sessions,
   * forcing re-authentication and preventing the attacker from continuing to use stolen tokens.
   */
  async refreshToken(oldToken: string): Promise<AuthTokens> {
    // Find the refresh token in the database
    const storedToken = await this.authRepository.findRefreshToken(oldToken);
    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if token is revoked — reuse detection
    if (storedToken.isRevoked) {
      // Token reuse detected: revoke ALL tokens for this user to terminate all sessions.
      // This prevents an attacker who stole a token from continuing to use it.
      await this.authRepository.revokeAllUserTokens(storedToken.user.id);
      throw new UnauthorizedException('Token reuse detected — all sessions terminated');
    }

    // Check if token is expired
    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Reject deactivated (banned) accounts — a valid refresh token must not let
    // a banned user keep rotating into fresh access tokens.
    if (!storedToken.user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Revoke the old refresh token (rotation)
    await this.authRepository.revokeToken(storedToken.id);

    // Issue a new token pair
    return this.generateTokenPair(storedToken.user.id, storedToken.user.role);
  }

  /**
   * Logout by revoking all refresh tokens for a user.
   */
  async logout(userId: string): Promise<void> {
    await this.authRepository.revokeAllUserTokens(userId);
  }

  /**
   * Request a password reset (TASK-169).
   *
   * Existence-hiding: for a missing, deactivated, or soft-deleted account this
   * resolves silently — no token, no email, no thrown error — so neither the
   * response shape nor a thrown exception can be used to enumerate accounts. The
   * controller always responds 200 regardless.
   *
   * For a valid active user: any still-active prior tokens are invalidated (one
   * honorable link at a time), a fresh opaque token is generated + persisted
   * (hashed at rest), and the reset email is enqueued via the outbox. The raw
   * token only ever lives in the email link — it is never logged.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.authRepository.findByEmail(email);

    // Silent no-op for a non-existent / banned / soft-deleted account.
    if (!user || !user.isActive || user.deletedAt) {
      return;
    }

    // Only the most recent request stays valid.
    await this.authRepository.invalidateActivePasswordResetTokens(user.id);

    // Opaque (non-JWT) token: used once, synchronously, against the DB anyway.
    const rawToken = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + this.parseExpirationToMs(this.passwordResetExpiration));

    await this.authRepository.savePasswordResetToken(user.id, rawToken, expiresAt);

    const resetUrl = `${this.storeClientUrl}/reset-password?token=${rawToken}`;
    await this.mailOutboxService.enqueuePasswordReset({
      to: user.email,
      resetUrl,
      expiresInHuman: this.formatExpirationHuman(this.passwordResetExpiration),
    });

    // Critical business event — never log the raw token or the reset URL.
    this.logger.info(
      { event: 'user.passwordResetRequested', userId: user.id },
      'Password reset requested',
    );
  }

  /**
   * Confirm a password reset (TASK-169).
   *
   * Validates the single-use token, sets the new password hash, marks the token
   * used, and revokes every refresh token for the user (forces re-login on all
   * devices). Every failure — token not found, already used, expired, or owned
   * by a deactivated/soft-deleted account — throws the SAME generic
   * `UnauthorizedException` so the response never reveals token/account state.
   */
  async confirmPasswordReset(rawToken: string, newPassword: string): Promise<void> {
    const stored = await this.authRepository.findPasswordResetToken(rawToken);

    const isInvalid =
      !stored ||
      Boolean(stored.usedAt) ||
      stored.expiresAt < new Date() ||
      !stored.user.isActive ||
      Boolean(stored.user.deletedAt);

    if (isInvalid || !stored) {
      // Server-side log still captures the specific reason for internal diagnosis.
      this.logger.warn({ event: 'user.passwordResetRejected' }, 'Password reset token rejected');
      throw new UnauthorizedException(INVALID_RESET_TOKEN_MESSAGE);
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.authRepository.updatePasswordHash(stored.user.id, passwordHash);
    await this.authRepository.markPasswordResetTokenUsed(stored.id);
    // Terminate every existing session — the reset must log the user out everywhere.
    await this.authRepository.revokeAllUserTokens(stored.user.id);

    this.logger.info(
      { event: 'user.passwordResetCompleted', userId: stored.user.id },
      'Password reset completed',
    );
  }

  /**
   * Generate an access/refresh token pair.
   * Access token uses JWT_SECRET, refresh token uses JWT_REFRESH_SECRET.
   * The refresh token is persisted in the database for tracking and rotation.
   */
  async generateTokenPair(userId: string, role: string): Promise<AuthTokens> {
    // Sign access token with JWT_SECRET
    const accessToken = this.jwtService.sign(
      { sub: userId, role },
      {
        secret: this.jwtSecret,
        expiresIn: this.jwtExpiration,
      },
    );

    // Sign refresh token with JWT_REFRESH_SECRET
    const refreshToken = this.jwtService.sign(
      { sub: userId, role, type: 'refresh' },
      {
        secret: this.jwtRefreshSecret,
        expiresIn: this.jwtRefreshExpiration,
      },
    );

    // Persist refresh token in the database
    const refreshExpirationMs = this.parseExpirationToMs(this.jwtRefreshExpiration);
    const expiresAt = new Date(Date.now() + refreshExpirationMs);

    await this.authRepository.saveRefreshToken(userId, refreshToken, expiresAt);

    const tokens = new AuthTokens();
    tokens.accessToken = accessToken;
    tokens.refreshToken = refreshToken;
    return tokens;
  }

  /**
   * Parse a duration string like "7d", "15m", "2h" into milliseconds.
   */
  private parseExpirationToMs(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      // Default to 7 days if format is unexpected
      return 7 * 24 * 60 * 60 * 1000;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 7 * 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Render a duration string like "1h"/"30m" into Ukrainian email copy
   * ("1 годину", "30 хвилин"), applying Ukrainian plural rules. Falls back to
   * the raw string if the format is unexpected.
   */
  private formatExpirationHuman(expiration: string): string {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return expiration;
    }

    const value = parseInt(match[1], 10);
    // [one, few, many] forms per Ukrainian pluralization.
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
