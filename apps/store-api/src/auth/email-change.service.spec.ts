import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { EmailTokenPurpose, Prisma } from '@prisma/client';
import { EmailChangeService } from './email-change.service';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { NotificationOutboxService } from '../notification-outbox/notification-outbox.service';

/**
 * TASK-396 — the owner's decision of 2026-08-27, point by point: password
 * first, nothing changes before the NEW inbox clicks, the OLD inbox gets a way
 * back, uniqueness is re-checked at the click, sessions end on apply, and the
 * operator's change is never marked verified.
 */
describe('EmailChangeService (TASK-396)', () => {
  const user = {
    id: 'user-1',
    email: 'old@example.com',
    isActive: true,
    deletedAt: null,
    emailVerifiedAt: new Date('2026-09-01'),
  };

  let repo: {
    findByEmail: jest.Mock;
    findEmailVerificationToken: jest.Mock;
    saveEmailVerificationToken: jest.Mock;
    invalidateActiveEmailVerificationTokens: jest.Mock;
    markEmailVerificationTokenUsed: jest.Mock;
    applyEmailChange: jest.Mock;
    revertEmailChange: jest.Mock;
    setUnverifiedEmail: jest.Mock;
  };
  let authService: { verifyOwnPassword: jest.Mock };
  let verification: { requestVerification: jest.Mock };
  let outbox: { enqueueEmailChangeConfirm: jest.Mock; enqueueEmailChangeNotice: jest.Mock };
  let service: EmailChangeService;

  const token = (overrides: Record<string, unknown> = {}) => ({
    id: 'tok-1',
    token: 'hashed',
    userId: user.id,
    email: 'new@example.com',
    previousEmail: 'old@example.com',
    purpose: EmailTokenPurpose.EMAIL_CHANGE,
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    createdAt: new Date(),
    user,
    ...overrides,
  });

  beforeEach(() => {
    repo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findEmailVerificationToken: jest.fn(),
      saveEmailVerificationToken: jest.fn(),
      invalidateActiveEmailVerificationTokens: jest.fn(),
      markEmailVerificationTokenUsed: jest.fn(),
      applyEmailChange: jest.fn(),
      revertEmailChange: jest.fn(),
      setUnverifiedEmail: jest.fn(),
    };
    authService = { verifyOwnPassword: jest.fn().mockResolvedValue(user) };
    verification = { requestVerification: jest.fn() };
    outbox = { enqueueEmailChangeConfirm: jest.fn(), enqueueEmailChangeNotice: jest.fn() };

    const config = {
      get: (key: string, fallback?: string) =>
        key === 'STORE_CLIENT_URL' ? 'http://shop.test' : fallback,
    } as unknown as ConfigService;
    const logger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as PinoLogger;

    service = new EmailChangeService(
      repo as unknown as AuthRepository,
      authService as unknown as AuthService,
      verification as unknown as EmailVerificationService,
      outbox as unknown as NotificationOutboxService,
      config,
      logger,
    );
  });

  // ─── request ───────────────────────────────────────────────────────────────

  describe('requestChange', () => {
    it('checks the password FIRST and changes nothing on a wrong one', async () => {
      authService.verifyOwnPassword.mockRejectedValue(new UnauthorizedException());

      await expect(service.requestChange(user.id, 'new@example.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
      // Not even the "is it taken?" lookup runs without the password.
      expect(repo.findByEmail).not.toHaveBeenCalled();
      expect(repo.saveEmailVerificationToken).not.toHaveBeenCalled();
      expect(outbox.enqueueEmailChangeConfirm).not.toHaveBeenCalled();
    });

    it('refuses the address the account already has', async () => {
      await expect(service.requestChange(user.id, user.email, 'pw')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses an address that belongs to another account (409)', async () => {
      repo.findByEmail.mockResolvedValue({ id: 'someone-else' });

      await expect(service.requestChange(user.id, 'new@example.com', 'pw')).rejects.toThrow(
        ConflictException,
      );
      expect(repo.saveEmailVerificationToken).not.toHaveBeenCalled();
    });

    it('issues a confirm link for the NEW address and a revert link for the OLD one — and changes nothing', async () => {
      await service.requestChange(user.id, 'new@example.com', 'pw');

      // Only a pending CHANGE is superseded; earlier revert links stay live.
      expect(repo.invalidateActiveEmailVerificationTokens).toHaveBeenCalledWith(user.id, [
        EmailTokenPurpose.EMAIL_CHANGE,
      ]);

      const [confirm, revert] = repo.saveEmailVerificationToken.mock.calls;
      expect(confirm[1]).toBe('new@example.com');
      expect(confirm[4]).toEqual({
        purpose: EmailTokenPurpose.EMAIL_CHANGE,
        previousEmail: 'old@example.com',
      });
      expect(revert[1]).toBe('old@example.com');
      expect(revert[4]).toEqual({
        purpose: EmailTokenPurpose.EMAIL_CHANGE_REVERT,
        previousEmail: 'old@example.com',
      });
      // The revert link outlives the confirm link (7 days vs 24 hours).
      expect((revert[3] as Date).getTime()).toBeGreaterThan((confirm[3] as Date).getTime());

      expect(outbox.enqueueEmailChangeConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'new@example.com',
          confirmUrl: `http://shop.test/confirm-email-change?token=${confirm[2]}`,
          expiresInHuman: '24 години',
        }),
      );
      expect(outbox.enqueueEmailChangeNotice).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'old@example.com',
          newEmail: 'new@example.com',
          revertUrl: `http://shop.test/revert-email-change?token=${revert[2]}`,
          revertExpiresInHuman: '7 днів',
        }),
      );

      // The login is untouched until the click.
      expect(repo.applyEmailChange).not.toHaveBeenCalled();
      expect(repo.setUnverifiedEmail).not.toHaveBeenCalled();
    });
  });

  // ─── confirm ───────────────────────────────────────────────────────────────

  describe('confirmChange', () => {
    it('applies the change for a live EMAIL_CHANGE link', async () => {
      repo.findEmailVerificationToken.mockResolvedValue(token());

      await expect(service.confirmChange('raw')).resolves.toEqual({ email: 'new@example.com' });

      expect(repo.applyEmailChange).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          tokenId: 'tok-1',
          newEmail: 'new@example.com',
        }),
      );
    });

    it('re-checks uniqueness at the click: taken meanwhile → 409, nothing applied', async () => {
      repo.findEmailVerificationToken.mockResolvedValue(token());
      repo.findByEmail.mockResolvedValue({ id: 'registered-meanwhile' });

      await expect(service.confirmChange('raw')).rejects.toThrow(ConflictException);
      expect(repo.applyEmailChange).not.toHaveBeenCalled();
    });

    it('answers the unique-index race (P2002) with the same 409', async () => {
      repo.findEmailVerificationToken.mockResolvedValue(token());
      repo.applyEmailChange.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '7' }),
      );

      await expect(service.confirmChange('raw')).rejects.toThrow(ConflictException);
    });

    it('burns and refuses a link whose account has since moved to another address', async () => {
      repo.findEmailVerificationToken.mockResolvedValue(
        token({ user: { ...user, email: 'reverted-or-operator@example.com' } }),
      );

      await expect(service.confirmChange('raw')).rejects.toThrow(BadRequestException);
      expect(repo.markEmailVerificationTokenUsed).toHaveBeenCalledWith('tok-1');
      expect(repo.applyEmailChange).not.toHaveBeenCalled();
    });

    it.each([
      ['not found', null],
      ['a VERIFY link', token({ purpose: EmailTokenPurpose.VERIFY })],
      ['a REVERT link', token({ purpose: EmailTokenPurpose.EMAIL_CHANGE_REVERT })],
      ['used', token({ usedAt: new Date() })],
      ['expired', token({ expiresAt: new Date(Date.now() - 1) })],
      ['owned by a banned account', token({ user: { ...user, isActive: false } })],
      ['owned by a deleted account', token({ user: { ...user, deletedAt: new Date() } })],
    ])('refuses a link that is %s with the one generic 400', async (_label, row) => {
      repo.findEmailVerificationToken.mockResolvedValue(row);

      await expect(service.confirmChange('raw')).rejects.toThrow('Invalid or expired link');
      expect(repo.applyEmailChange).not.toHaveBeenCalled();
    });
  });

  // ─── revert ────────────────────────────────────────────────────────────────

  describe('revertChange', () => {
    const revertToken = (overrides: Record<string, unknown> = {}) =>
      token({
        purpose: EmailTokenPurpose.EMAIL_CHANGE_REVERT,
        email: 'old@example.com',
        previousEmail: 'old@example.com',
        ...overrides,
      });

    it('restores the previous address after a confirmed change', async () => {
      repo.findEmailVerificationToken.mockResolvedValue(
        revertToken({ user: { ...user, email: 'attacker@example.com' } }),
      );

      await expect(service.revertChange('raw')).resolves.toEqual({ email: 'old@example.com' });
      expect(repo.revertEmailChange).toHaveBeenCalledWith(
        expect.objectContaining({ userId: user.id, restoreEmail: 'old@example.com' }),
      );
    });

    it('cancels a change that was never confirmed (address unchanged) and still ends sessions', async () => {
      repo.findEmailVerificationToken.mockResolvedValue(revertToken());

      await service.revertChange('raw');

      expect(repo.findByEmail).not.toHaveBeenCalled();
      expect(repo.revertEmailChange).toHaveBeenCalledWith(
        expect.objectContaining({ restoreEmail: 'old@example.com' }),
      );
    });

    it('refuses with 409 when the old address was registered by someone else meanwhile', async () => {
      repo.findEmailVerificationToken.mockResolvedValue(
        revertToken({ user: { ...user, email: 'attacker@example.com' } }),
      );
      repo.findByEmail.mockResolvedValue({ id: 'newcomer' });

      await expect(service.revertChange('raw')).rejects.toThrow(ConflictException);
      expect(repo.revertEmailChange).not.toHaveBeenCalled();
    });

    it('does not accept an EMAIL_CHANGE link as a revert link', async () => {
      repo.findEmailVerificationToken.mockResolvedValue(token());

      await expect(service.revertChange('raw')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── operator ──────────────────────────────────────────────────────────────

  describe('changeByOperator', () => {
    it('sets the address UNVERIFIED and sends a verification link to it', async () => {
      await service.changeByOperator(user, 'new@example.com');

      expect(repo.setUnverifiedEmail).toHaveBeenCalledWith(user.id, 'new@example.com');
      expect(verification.requestVerification).toHaveBeenCalledWith(user.id);
      // Never the self-service path that stamps "verified".
      expect(repo.applyEmailChange).not.toHaveBeenCalled();
    });

    it('refuses an address that belongs to another account', async () => {
      repo.findByEmail.mockResolvedValue({ id: 'other' });

      await expect(service.changeByOperator(user, 'new@example.com')).rejects.toThrow(
        ConflictException,
      );
      expect(repo.setUnverifiedEmail).not.toHaveBeenCalled();
    });

    it('refuses the address the customer already has', async () => {
      await expect(service.changeByOperator(user, user.email)).rejects.toThrow(BadRequestException);
    });
  });
});
