import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { EmailVerificationService } from './email-verification.service';
import { AuthRepository } from './auth.repository';
import { MailOutboxService } from '../mail-outbox/mail-outbox.service';
import { GUEST_ORDER_CLAIM_PORT } from '../common/ports/guest-order-claim.port';

const authRepositoryMock = {
  findById: jest.fn(),
  invalidateActiveEmailVerificationTokens: jest.fn(),
  saveEmailVerificationToken: jest.fn(),
  findEmailVerificationToken: jest.fn(),
  markEmailVerificationTokenUsed: jest.fn(),
  markEmailVerified: jest.fn(),
};

const mailOutboxMock = {
  enqueueEmailVerification: jest.fn(),
};

const loggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const configMock = {
  get: (key: string, fallback: string) =>
    key === 'STORE_CLIENT_URL' ? 'http://localhost:3000' : fallback,
};

// TASK-485: the order side, reached by token instead of by import — see
// `guest-order-claim.port.ts` for the module cycle that rules out injecting it.
const claimPortMock = {
  claimGuestOrders: jest.fn(),
};

const moduleRefMock = {
  get: jest.fn((token: unknown) => {
    if (token === GUEST_ORDER_CLAIM_PORT) {
      return claimPortMock;
    }
    throw new Error('Nest could not find the requested provider');
  }),
};

const activeUser = {
  id: 'user-1',
  email: 'current@example.com',
  isActive: true,
  deletedAt: null,
  emailVerifiedAt: null,
};

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tok-1',
    token: 'hashed',
    userId: 'user-1',
    email: 'current@example.com',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    createdAt: new Date(),
    user: activeUser,
    ...overrides,
  };
}

describe('EmailVerificationService (TASK-342)', () => {
  let service: EmailVerificationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    claimPortMock.claimGuestOrders.mockResolvedValue(0);
    moduleRefMock.get.mockImplementation((token: unknown) => {
      if (token === GUEST_ORDER_CLAIM_PORT) {
        return claimPortMock;
      }
      throw new Error('Nest could not find the requested provider');
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailVerificationService,
        { provide: AuthRepository, useValue: authRepositoryMock },
        { provide: MailOutboxService, useValue: mailOutboxMock },
        { provide: ConfigService, useValue: configMock },
        { provide: PinoLogger, useValue: loggerMock },
        { provide: ModuleRef, useValue: moduleRefMock },
      ],
    }).compile();

    service = module.get(EmailVerificationService);
  });

  describe('requestVerification', () => {
    it('records the address the token is issued FOR, alongside the user', async () => {
      authRepositoryMock.findById.mockResolvedValue(activeUser);

      await service.requestVerification('user-1');

      expect(authRepositoryMock.saveEmailVerificationToken).toHaveBeenCalledWith(
        'user-1',
        'current@example.com',
        expect.any(String),
        expect.any(Date),
      );
    });

    it('invalidates prior links, so only the most recent one works', async () => {
      authRepositoryMock.findById.mockResolvedValue(activeUser);

      await service.requestVerification('user-1');

      expect(authRepositoryMock.invalidateActiveEmailVerificationTokens).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('never logs the raw token or the link', async () => {
      authRepositoryMock.findById.mockResolvedValue(activeUser);

      await service.requestVerification('user-1');

      const rawToken = authRepositoryMock.saveEmailVerificationToken.mock.calls[0][2] as string;
      const logged = JSON.stringify(loggerMock.info.mock.calls);
      expect(logged).not.toContain(rawToken);
      expect(logged).not.toContain('verify-email?token=');
    });

    it.each([
      ['a missing account', null],
      ['a banned account', { ...activeUser, isActive: false }],
      ['a soft-deleted account', { ...activeUser, deletedAt: new Date() }],
      ['an already-verified address', { ...activeUser, emailVerifiedAt: new Date() }],
    ])('sends nothing for %s', async (_label, user) => {
      authRepositoryMock.findById.mockResolvedValue(user);

      await expect(service.requestVerification('user-1')).resolves.toBeUndefined();
      expect(mailOutboxMock.enqueueEmailVerification).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('verifies when the token names the account’s current address', async () => {
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(tokenRow());

      await expect(service.confirm('raw')).resolves.toEqual({
        email: 'current@example.com',
        claimedOrders: 0,
      });

      expect(authRepositoryMock.markEmailVerified).toHaveBeenCalledWith('user-1', expect.any(Date));
      expect(authRepositoryMock.markEmailVerificationTokenUsed).toHaveBeenCalledWith('tok-1');
    });

    it('REFUSES a token whose address the account has since changed away from', async () => {
      // The whole point of TASK-342. A link proving `old@example.com`, clicked
      // after the account moved to `current@example.com`, would otherwise mark
      // the NEW address verified on the strength of proof about the OLD one —
      // a way to get an unproven (possibly someone else's) address marked
      // proven using a legitimately issued link.
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(
        tokenRow({ email: 'old@example.com' }),
      );

      await expect(service.confirm('raw')).rejects.toBeInstanceOf(BadRequestException);

      expect(authRepositoryMock.markEmailVerified).not.toHaveBeenCalled();
      // …and the now-useless token is burned rather than left live in an inbox.
      expect(authRepositoryMock.markEmailVerificationTokenUsed).toHaveBeenCalledWith('tok-1');
    });

    it.each([
      ['not found', null],
      ['already used', tokenRow({ usedAt: new Date() })],
      ['expired', tokenRow({ expiresAt: new Date(Date.now() - 1000) })],
      ['owned by a banned account', tokenRow({ user: { ...activeUser, isActive: false } })],
      ['owned by a deleted account', tokenRow({ user: { ...activeUser, deletedAt: new Date() } })],
    ])('rejects a token that is %s, with one generic message', async (_label, row) => {
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(row);

      await expect(service.confirm('raw')).rejects.toThrow('Invalid or expired verification link');
      expect(authRepositoryMock.markEmailVerified).not.toHaveBeenCalled();
    });
  });

  // ─── Claiming guest orders (TASK-485, closing the tail of TASK-338) ──────────
  //
  // The decision this block defends (B-5 §5): guest orders move onto an account
  // when the address is PROVEN, not when it is merely typed. Signing in with an
  // unverified address is not blocked, so claiming any earlier would hand a
  // stranger's phone number, order totals and delivery address to whoever put
  // that stranger's email in the signup form.

  describe('confirm — claiming guest orders', () => {
    it('claims the orders of the address the token proves, once it is verified', async () => {
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(tokenRow());
      claimPortMock.claimGuestOrders.mockResolvedValue(3);

      await expect(service.confirm('raw')).resolves.toEqual({
        email: 'current@example.com',
        claimedOrders: 3,
      });

      expect(claimPortMock.claimGuestOrders).toHaveBeenCalledWith('user-1', 'current@example.com');
    });

    it('claims the address ON THE TOKEN, not whatever the account says today', async () => {
      // They are equal on the happy path by construction (a mismatch is refused
      // above), so this pins WHICH of the two is read: the proven one.
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(
        tokenRow({
          email: 'proven@example.com',
          user: { ...activeUser, email: 'proven@example.com' },
        }),
      );

      await service.confirm('raw');

      expect(claimPortMock.claimGuestOrders).toHaveBeenCalledWith('user-1', 'proven@example.com');
    });

    it.each([
      ['not found', null],
      ['already used', tokenRow({ usedAt: new Date() })],
      ['expired', tokenRow({ expiresAt: new Date(Date.now() - 1000) })],
      ['owned by a banned account', tokenRow({ user: { ...activeUser, isActive: false } })],
      ['owned by a deleted account', tokenRow({ user: { ...activeUser, deletedAt: new Date() } })],
      ['issued for an address the account left', tokenRow({ email: 'old@example.com' })],
    ])('claims NOTHING when the token is %s', async (_label, row) => {
      // THE test of this task. An unverified address must not move a single
      // order: every one of these paths leaves the address unproven, and a claim
      // on an unproven address is exactly the data leak the design avoids.
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(row);

      await expect(service.confirm('raw')).rejects.toBeInstanceOf(BadRequestException);
      expect(claimPortMock.claimGuestOrders).not.toHaveBeenCalled();
    });

    it('reaches the order side by token, never by importing the module', async () => {
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(tokenRow());

      await service.confirm('raw');

      // `strict: false` is what makes the lookup work without AuthModule
      // importing OrderModule — the cycle the port exists to avoid.
      expect(moduleRefMock.get).toHaveBeenCalledWith(GUEST_ORDER_CLAIM_PORT, { strict: false });
    });

    it('still reports the address as verified when claiming blows up', async () => {
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(tokenRow());
      claimPortMock.claimGuestOrders.mockRejectedValue(new Error('db down'));

      // The verification is committed and its token burned by this point.
      // Throwing would tell somebody whose address IS verified that their link
      // was invalid, and leave them nothing to retry.
      await expect(service.confirm('raw')).resolves.toEqual({
        email: 'current@example.com',
        claimedOrders: 0,
      });
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('survives an order side that is not in the container at all', async () => {
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(tokenRow());
      moduleRefMock.get.mockImplementation(() => {
        throw new Error('Nest could not find the requested provider');
      });

      await expect(service.confirm('raw')).resolves.toEqual({
        email: 'current@example.com',
        claimedOrders: 0,
      });
    });
  });
});
