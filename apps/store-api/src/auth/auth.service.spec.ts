import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { AuthTokens } from './entities';
import { RegisterDto } from './dto';

// ─── Mock argon2 ──────────────────────────────────────────────────────────────

jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const argon2 = require('argon2');

// ─── Mock factories ─────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
  firstName: 'John',
  lastName: 'Doe',
  phone: null,
  role: 'CUSTOMER' as const,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRefreshTokenRecord = {
  id: 'rt-uuid-1',
  token: 'refresh-token-value',
  userId: 'user-uuid-1',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  isRevoked: false,
  createdAt: new Date(),
  user: mockUser,
};

// ─── Config mock ─────────────────────────────────────────────────────────────

const configMock = {
  get: jest.fn((key: string, defaultValue?: string) => {
    const config: Record<string, string> = {
      JWT_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      JWT_EXPIRATION: '15m',
      JWT_REFRESH_EXPIRATION: '7d',
    };
    return config[key] ?? defaultValue ?? '';
  }),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let authRepository: jest.Mocked<AuthRepository>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    // Reset argon2 mocks before each test
    (argon2.hash as jest.Mock).mockResolvedValue('hashed-password');
    (argon2.verify as jest.Mock).mockResolvedValue(true);

    // Reset config mock call history
    configMock.get.mockClear();

    // Create a mock AuthRepository
    const authRepositoryMock = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      createUser: jest.fn(),
      findRefreshToken: jest.fn(),
      saveRefreshToken: jest.fn(),
      revokeToken: jest.fn(),
      revokeAllUserTokens: jest.fn(),
    };

    // Create a mock JwtService
    const jwtServiceMock = {
      sign: jest.fn(),
      verify: jest.fn(),
      verifyAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: authRepositoryMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    authRepository = module.get(AuthRepository) as jest.Mocked<AuthRepository>;
    jwtService = module.get(JwtService) as jest.Mocked<JwtService>;
  });

  // ─── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'test@example.com',
      password: 'StrongP@ss123',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should throw ConflictException when email already exists', async () => {
      authRepository.findByEmail.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(authRepository.findByEmail).toHaveBeenCalledWith(registerDto.email);
    });

    it('should create user and return tokens when email is new', async () => {
      authRepository.findByEmail.mockResolvedValue(null);
      authRepository.createUser.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValueOnce('access-token-value');
      jwtService.sign.mockReturnValueOnce('refresh-token-value');
      authRepository.saveRefreshToken.mockResolvedValue(mockRefreshTokenRecord);

      const result = await service.register(registerDto);

      expect(result).toBeInstanceOf(AuthTokens);
      expect(result.accessToken).toBe('access-token-value');
      expect(result.refreshToken).toBe('refresh-token-value');

      // Verify password was hashed with argon2
      expect(argon2.hash).toHaveBeenCalledWith(registerDto.password);

      // Verify user was created with hashed password
      expect(authRepository.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registerDto.email,
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
        }),
      );

      // Verify token pair was generated
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
      expect(authRepository.saveRefreshToken).toHaveBeenCalled();
    });
  });

  // ─── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    const loginEmail = 'test@example.com';
    const loginPassword = 'StrongP@ss123';

    it('should throw UnauthorizedException when email not found', async () => {
      authRepository.findByEmail.mockResolvedValue(null);

      await expect(service.login(loginEmail, loginPassword)).rejects.toThrow(UnauthorizedException);
      expect(authRepository.findByEmail).toHaveBeenCalledWith(loginEmail);
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      authRepository.findByEmail.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginEmail, 'WrongPassword123')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(argon2.verify).toHaveBeenCalledWith(mockUser.passwordHash, 'WrongPassword123');
    });

    it('should return tokens when credentials are valid', async () => {
      authRepository.findByEmail.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValueOnce('access-token-value');
      jwtService.sign.mockReturnValueOnce('refresh-token-value');
      authRepository.saveRefreshToken.mockResolvedValue(mockRefreshTokenRecord);

      const result = await service.login(loginEmail, loginPassword);

      expect(result).toBeInstanceOf(AuthTokens);
      expect(result.accessToken).toBe('access-token-value');
      expect(result.refreshToken).toBe('refresh-token-value');
      expect(argon2.verify).toHaveBeenCalledWith(mockUser.passwordHash, loginPassword);
      expect(authRepository.saveRefreshToken).toHaveBeenCalled();
    });
  });

  // ─── refreshToken ───────────────────────────────────────────────────────────

  describe('refreshToken', () => {
    it('should throw UnauthorizedException when token is invalid (not found)', async () => {
      authRepository.findRefreshToken.mockResolvedValue(null);

      await expect(service.refreshToken('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should revoke ALL user tokens and throw when revoked token is reused (reuse detection)', async () => {
      const revokedToken = {
        ...mockRefreshTokenRecord,
        isRevoked: true,
      };
      authRepository.findRefreshToken.mockResolvedValue(revokedToken);
      authRepository.revokeAllUserTokens.mockResolvedValue(undefined);

      await expect(service.refreshToken('revoked-token')).rejects.toThrow(
        new UnauthorizedException('Token reuse detected — all sessions terminated'),
      );

      // Must revoke ALL tokens for the user, not just the reused one
      expect(authRepository.revokeAllUserTokens).toHaveBeenCalledWith(mockUser.id);
      // Must NOT call revokeToken (single token) — the entire family is revoked
      expect(authRepository.revokeToken).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      const expiredToken = {
        ...mockRefreshTokenRecord,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
      };
      authRepository.findRefreshToken.mockResolvedValue(expiredToken);

      await expect(service.refreshToken('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should revoke old token and return new pair (rotation)', async () => {
      authRepository.findRefreshToken.mockResolvedValue(mockRefreshTokenRecord);
      jwtService.sign.mockReturnValueOnce('new-access-token');
      jwtService.sign.mockReturnValueOnce('new-refresh-token');
      authRepository.saveRefreshToken.mockResolvedValue({
        ...mockRefreshTokenRecord,
        token: 'new-refresh-token',
      });

      const result = await service.refreshToken('refresh-token-value');

      expect(result).toBeInstanceOf(AuthTokens);
      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');

      // Old token must be revoked
      expect(authRepository.revokeToken).toHaveBeenCalledWith(mockRefreshTokenRecord.id);

      // New refresh token must be persisted
      expect(authRepository.saveRefreshToken).toHaveBeenCalled();
    });
  });

  // ─── logout ────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should revoke all user tokens', async () => {
      authRepository.revokeAllUserTokens.mockResolvedValue(undefined);

      await service.logout('user-uuid-1');

      expect(authRepository.revokeAllUserTokens).toHaveBeenCalledWith('user-uuid-1');
    });
  });

  // ─── generateTokenPair ────────────────────────────────────────────────────

  describe('generateTokenPair', () => {
    it('should use JWT_SECRET for access token and JWT_REFRESH_SECRET for refresh token', async () => {
      jwtService.sign.mockReturnValueOnce('access-token-value');
      jwtService.sign.mockReturnValueOnce('refresh-token-value');
      authRepository.saveRefreshToken.mockResolvedValue(mockRefreshTokenRecord);

      await service.generateTokenPair('user-uuid-1', 'CUSTOMER');

      // First call: access token with JWT_SECRET
      expect(jwtService.sign).toHaveBeenNthCalledWith(
        1,
        { sub: 'user-uuid-1', role: 'CUSTOMER' },
        {
          secret: 'test-access-secret',
          expiresIn: '15m',
        },
      );

      // Second call: refresh token with JWT_REFRESH_SECRET
      expect(jwtService.sign).toHaveBeenNthCalledWith(
        2,
        { sub: 'user-uuid-1', role: 'CUSTOMER', type: 'refresh' },
        {
          secret: 'test-refresh-secret',
          expiresIn: '7d',
        },
      );
    });
  });
});
