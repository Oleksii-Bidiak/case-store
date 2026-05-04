import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthRepository, CreateUserInput } from './auth.repository';
import { AuthTokens } from './entities';
import { RegisterDto } from './dto';

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly jwtExpiration: string;
  private readonly jwtRefreshExpiration: string;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET', 'dev-secret');
    this.jwtRefreshSecret = this.configService.get<string>(
      'JWT_REFRESH_SECRET',
      'dev-refresh-secret',
    );
    this.jwtExpiration = this.configService.get<string>('JWT_EXPIRATION', '15m');
    this.jwtRefreshExpiration = this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d');
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

    // Generate and return token pair
    return this.generateTokenPair(user.id, user.role);
  }

  /**
   * Refresh authentication tokens.
   * Validates stored token, checks not revoked/expired, revokes old, issues new pair.
   */
  async refreshToken(oldToken: string): Promise<AuthTokens> {
    // Find the refresh token in the database
    const storedToken = await this.authRepository.findRefreshToken(oldToken);
    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if token is revoked
    if (storedToken.isRevoked) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // Check if token is expired
    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
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
      { sub: userId, type: 'refresh' },
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
}
