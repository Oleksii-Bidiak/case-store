import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { CheckoutAccountService } from './checkout-account.service';
import { CheckoutAccountErrorCode } from './checkout-account.errors';
import type { AuthRepository } from './auth.repository';
import type { AuthService } from './auth.service';
import type { EmailVerificationService } from './email-verification.service';
import { buildUser } from '../../test/user.fixture';

/**
 * TASK-2010 (B-12 тема 2): the account a guest creates by ticking «Створити
 * акаунт» at checkout — created without a password inside the order
 * transaction, signed in at once, and finished later from the «Задайте пароль»
 * letter, which doubles as the proof of the mailbox.
 */
describe('CheckoutAccountService', () => {
  const authRepository = {
    findByEmail: jest.fn(),
    createPasswordlessUser: jest.fn(),
    findEmailVerificationToken: jest.fn(),
    markEmailVerificationTokenUsed: jest.fn(),
  };
  const authService = {
    generateTokenPair: jest.fn(),
    setPassword: jest.fn(),
    assertPasswordMeetsRolePolicy: jest.fn(),
  };
  const emailVerification = {
    issueAccountSetupLink: jest.fn(),
    adoptProvenAddress: jest.fn(),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const session = { userId: 'user-1', accessToken: 'access', refreshToken: 'refresh' };
  const tx = { marker: 'tx' } as unknown as Prisma.TransactionClient;

  let service: CheckoutAccountService;

  beforeEach(() => {
    jest.resetAllMocks();
    authService.generateTokenPair.mockResolvedValue(session);
    emailVerification.adoptProvenAddress.mockResolvedValue(0);
    service = new CheckoutAccountService(
      authRepository as unknown as AuthRepository,
      authService as unknown as AuthService,
      emailVerification as unknown as EmailVerificationService,
      logger as unknown as PinoLogger,
    );
  });

  function expectCode(error: unknown, code: string, status: number): void {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(status);
    expect((error as HttpException).getResponse()).toMatchObject({ error: code });
  }

  // ─── Does this address already have an account? ─────────────────────────────

  describe('hasAccount', () => {
    it('answers true for any user row on the address — deactivated and deleted ones included', async () => {
      authRepository.findByEmail.mockResolvedValue(buildUser({ isActive: false }));

      await expect(service.hasAccount('  Olena@Example.COM ')).resolves.toBe(true);
      // The same normalised lookup `register` relies on.
      expect(authRepository.findByEmail).toHaveBeenCalledWith('olena@example.com');
    });

    it('answers false for a free address', async () => {
      authRepository.findByEmail.mockResolvedValue(null);

      await expect(service.hasAccount('free@example.com')).resolves.toBe(false);
    });
  });

  describe('assertNoAccount', () => {
    it('refuses an address that already has an account with 409 ACCOUNT_EXISTS', async () => {
      authRepository.findByEmail.mockResolvedValue(buildUser());

      const error = await service.assertNoAccount('taken@example.com').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expectCode(error, CheckoutAccountErrorCode.ACCOUNT_EXISTS, 409);
    });

    it('lets a free address through', async () => {
      authRepository.findByEmail.mockResolvedValue(null);

      await expect(service.assertNoAccount('free@example.com')).resolves.toBeUndefined();
    });
  });

  // ─── Creating the account inside the order transaction ──────────────────────

  describe('createPasswordless', () => {
    it('writes a password-less CUSTOMER through the caller transaction and returns its id', async () => {
      authRepository.createPasswordlessUser.mockResolvedValue(buildUser({ id: 'user-new' }));

      const id = await service.createPasswordless(
        { email: 'olena@example.com', name: 'Олена Шевченко', phone: '380501234567' },
        tx,
      );

      expect(id).toBe('user-new');
      expect(authRepository.createPasswordlessUser).toHaveBeenCalledWith(
        {
          email: 'olena@example.com',
          firstName: 'Олена',
          lastName: 'Шевченко',
          phone: '380501234567',
        },
        tx,
      );
    });

    it('keeps a multi-word surname together and leaves a one-word name without a surname', async () => {
      authRepository.createPasswordlessUser.mockResolvedValue(buildUser());

      await service.createPasswordless(
        { email: 'a@example.com', name: '  Анна  Марія Коваль ', phone: '380501234567' },
        tx,
      );
      await service.createPasswordless(
        { email: 'b@example.com', name: 'Мирослав', phone: '380501234567' },
        tx,
      );

      expect(authRepository.createPasswordlessUser.mock.calls[0][0]).toMatchObject({
        firstName: 'Анна',
        lastName: 'Марія Коваль',
      });
      expect(authRepository.createPasswordlessUser.mock.calls[1][0]).toEqual(
        expect.objectContaining({ firstName: 'Мирослав', lastName: undefined }),
      );
    });

    it('turns a concurrent sign-up on the same address (unique violation) into 409 ACCOUNT_EXISTS', async () => {
      authRepository.createPasswordlessUser.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      const error = await service
        .createPasswordless({ email: 'a@example.com', name: 'A', phone: '380501234567' }, tx)
        .catch((e: unknown) => e);

      expectCode(error, CheckoutAccountErrorCode.ACCOUNT_EXISTS, 409);
    });

    it('lets any other failure through untouched', async () => {
      const boom = new Error('db down');
      authRepository.createPasswordlessUser.mockRejectedValue(boom);

      await expect(
        service.createPasswordless({ email: 'a@example.com', name: 'A', phone: '1' }, tx),
      ).rejects.toBe(boom);
    });
  });

  describe('issueSetupLink', () => {
    it('hands the «Задайте пароль» link to the verification service inside the same tx', async () => {
      await service.issueSetupLink({ id: 'user-1', email: 'a@example.com' }, tx);

      expect(emailVerification.issueAccountSetupLink).toHaveBeenCalledWith(
        { id: 'user-1', email: 'a@example.com' },
        tx,
      );
    });
  });

  describe('startSession', () => {
    it('signs the new CUSTOMER in with an ordinary token pair', async () => {
      await expect(service.startSession('user-1')).resolves.toBe(session);

      expect(authService.generateTokenPair).toHaveBeenCalledWith('user-1', UserRole.CUSTOMER);
    });
  });

  // ─── POST /auth/account-setup/confirm ───────────────────────────────────────

  describe('confirmSetup', () => {
    const owner = buildUser({ id: 'user-1', email: 'olena@example.com', emailVerifiedAt: null });

    function setupToken(overrides: Record<string, unknown> = {}) {
      return {
        id: 'tok-1',
        token: 'hashed',
        userId: 'user-1',
        email: 'olena@example.com',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        createdAt: new Date(),
        purpose: 'ACCOUNT_SETUP',
        previousEmail: null,
        user: owner,
        ...overrides,
      };
    }

    it('proves the address (revoke → stamp → claim), burns the link and opens a new session', async () => {
      authRepository.findEmailVerificationToken.mockResolvedValue(setupToken());
      emailVerification.adoptProvenAddress.mockResolvedValue(2);

      await expect(service.confirmSetup('raw')).resolves.toEqual({ session, claimedOrders: 2 });

      expect(emailVerification.adoptProvenAddress).toHaveBeenCalledWith(owner, 'olena@example.com');
      expect(authRepository.markEmailVerificationTokenUsed).toHaveBeenCalledWith('tok-1');
      expect(authService.setPassword).not.toHaveBeenCalled();
      // The session is minted AFTER the adoption, whose revoke must not take it.
      const adopted = emailVerification.adoptProvenAddress.mock.invocationCallOrder[0];
      const issued = authService.generateTokenPair.mock.invocationCallOrder[0];
      expect(adopted).toBeLessThan(issued);
      expect(authService.generateTokenPair).toHaveBeenCalledWith('user-1', owner.role);
    });

    it('sets the password through the shared Argon2 tail when one is given', async () => {
      authRepository.findEmailVerificationToken.mockResolvedValue(setupToken());

      await service.confirmSetup('raw', 'newpassword1');

      expect(authService.assertPasswordMeetsRolePolicy).toHaveBeenCalledWith(
        owner.role,
        'newpassword1',
      );
      expect(authService.setPassword).toHaveBeenCalledWith('user-1', 'newpassword1');
      const passwordSet = authService.setPassword.mock.invocationCallOrder[0];
      const issued = authService.generateTokenPair.mock.invocationCallOrder[0];
      // setPassword revokes every refresh token — it must not revoke the new one.
      expect(passwordSet).toBeLessThan(issued);
    });

    it('checks the password policy BEFORE anything is written', async () => {
      authRepository.findEmailVerificationToken.mockResolvedValue(setupToken());
      authService.assertPasswordMeetsRolePolicy.mockImplementation(() => {
        throw new BadRequestException('too weak');
      });

      await expect(service.confirmSetup('raw', 'weak')).rejects.toThrow('too weak');

      expect(emailVerification.adoptProvenAddress).not.toHaveBeenCalled();
      expect(authRepository.markEmailVerificationTokenUsed).not.toHaveBeenCalled();
      expect(authService.setPassword).not.toHaveBeenCalled();
    });

    it.each([
      ['not found', null],
      ['a plain VERIFY link', setupToken({ purpose: 'VERIFY' })],
      ['an EMAIL_CHANGE link', setupToken({ purpose: 'EMAIL_CHANGE' })],
      ['already used', setupToken({ usedAt: new Date() })],
      ['expired', setupToken({ expiresAt: new Date(Date.now() - 1000) })],
      ['owned by a banned account', setupToken({ user: { ...owner, isActive: false } })],
      ['owned by a deleted account', setupToken({ user: { ...owner, deletedAt: new Date() } })],
    ])('refuses a link that is %s with one generic 400', async (_label, row) => {
      authRepository.findEmailVerificationToken.mockResolvedValue(row);

      const error = await service.confirmSetup('raw', 'newpassword1').catch((e: unknown) => e);

      expectCode(error, CheckoutAccountErrorCode.ACCOUNT_SETUP_INVALID, 400);
      expect(emailVerification.adoptProvenAddress).not.toHaveBeenCalled();
      expect(authService.setPassword).not.toHaveBeenCalled();
      expect(authService.generateTokenPair).not.toHaveBeenCalled();
    });

    it('refuses — and burns — a link for an address the account has since left', async () => {
      authRepository.findEmailVerificationToken.mockResolvedValue(
        setupToken({ email: 'old@example.com' }),
      );

      const error = await service.confirmSetup('raw').catch((e: unknown) => e);

      expectCode(error, CheckoutAccountErrorCode.ACCOUNT_SETUP_INVALID, 400);
      expect(authRepository.markEmailVerificationTokenUsed).toHaveBeenCalledWith('tok-1');
      expect(emailVerification.adoptProvenAddress).not.toHaveBeenCalled();
      expect(authService.generateTokenPair).not.toHaveBeenCalled();
    });
  });
});
