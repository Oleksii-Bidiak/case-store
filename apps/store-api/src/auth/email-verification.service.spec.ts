import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { EmailVerificationService } from './email-verification.service';
import { AuthRepository } from './auth.repository';
import { NotificationOutboxService } from '../notification-outbox/notification-outbox.service';
import { GUEST_ORDER_CLAIM_PORT } from '../common/ports/guest-order-claim.port';

const authRepositoryMock = {
  findById: jest.fn(),
  invalidateActiveEmailVerificationTokens: jest.fn(),
  saveEmailVerificationToken: jest.fn(),
  findEmailVerificationToken: jest.fn(),
  markEmailVerificationTokenUsed: jest.fn(),
  markEmailVerified: jest.fn(),
  revokeAllUserTokens: jest.fn(),
};

const mailOutboxMock = {
  enqueueEmailVerification: jest.fn(),
  enqueueAccountSetup: jest.fn(),
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
  // TASK-2010 review: a password-less account (checkout / Google) — the default
  // path; the password account's own rules are pinned in their own block.
  passwordHash: null,
  role: 'CUSTOMER',
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
    purpose: 'VERIFY',
    previousEmail: null,
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
        { provide: NotificationOutboxService, useValue: mailOutboxMock },
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

      await expect(service.confirm('raw')).resolves.toMatchObject({
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
      // TASK-396: an address-change link is not a verification link, whatever it proves.
      ['an EMAIL_CHANGE link', tokenRow({ purpose: 'EMAIL_CHANGE' })],
      ['an EMAIL_CHANGE_REVERT link', tokenRow({ purpose: 'EMAIL_CHANGE_REVERT' })],
    ])('rejects a token that is %s, with one generic message', async (_label, row) => {
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(row);

      await expect(service.confirm('raw')).rejects.toThrow('Invalid or expired verification link');
      expect(authRepositoryMock.markEmailVerified).not.toHaveBeenCalled();
    });

    it('leaves an address-change link UNBURNED when it is pasted into the verify page (TASK-396)', async () => {
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(
        tokenRow({ purpose: 'EMAIL_CHANGE', email: 'new@example.com' }),
      );

      await expect(service.confirm('raw')).rejects.toBeInstanceOf(BadRequestException);
      expect(authRepositoryMock.markEmailVerificationTokenUsed).not.toHaveBeenCalled();
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

      await expect(service.confirm('raw')).resolves.toMatchObject({
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
      await expect(service.confirm('raw')).resolves.toMatchObject({
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

      await expect(service.confirm('raw')).resolves.toMatchObject({
        email: 'current@example.com',
        claimedOrders: 0,
      });
    });
  });

  // ─── TASK-2010 (B-12 тема 2, п.3): the "taken address" defence ──────────────
  //
  // A checkout sign-up creates an account on whatever address was typed, with no
  // proof. If the real owner of that mailbox later proves it, whoever created the
  // account must lose it BEFORE the owner's guest orders move onto it — so every
  // refresh token is revoked first, then the address is stamped, then claimed.

  describe('confirm — revoking the sessions of an unproven account', () => {
    it('revokes every refresh token BEFORE verifying and claiming', async () => {
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(tokenRow());

      await service.confirm('raw');

      const revoked = authRepositoryMock.revokeAllUserTokens.mock.invocationCallOrder[0];
      const verified = authRepositoryMock.markEmailVerified.mock.invocationCallOrder[0];
      const claimed = claimPortMock.claimGuestOrders.mock.invocationCallOrder[0];
      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith('user-1');
      expect(revoked).toBeLessThan(verified);
      expect(verified).toBeLessThan(claimed);
    });

    it('signs nobody out when the address was already proven', async () => {
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(
        tokenRow({ user: { ...activeUser, emailVerifiedAt: new Date('2026-10-01') } }),
      );

      await service.confirm('raw');

      expect(authRepositoryMock.revokeAllUserTokens).not.toHaveBeenCalled();
      expect(claimPortMock.claimGuestOrders).toHaveBeenCalledWith('user-1', 'current@example.com');
    });
  });

  // ─── Review of S5-API: the pre-hijack through /register ──────────────────────
  //
  // An attacker registers the victim's address WITH A PASSWORD; the automatic
  // letter lands in the victim's inbox; the victim clicks it. Proving the
  // mailbox alone would then claim the victim's guest orders into an account
  // whose password the attacker knows. So for a password account the link
  // completes only for a request signed in as that very account — which proves
  // the password AND the mailbox. Anyone else is asked to sign in, and the link
  // is NOT spent (the real owner can still use it, or reset the password).

  describe('confirm — an account WITH a password', () => {
    const passwordUser = { ...activeUser, passwordHash: '$argon2id$hash' };

    it('refuses an unauthenticated click with 403 VERIFY_SIGN_IN_REQUIRED and leaves the link usable', async () => {
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(
        tokenRow({ user: passwordUser }),
      );

      const error = await service.confirm('raw', null).catch((e: unknown) => e);

      expect((error as { getStatus(): number }).getStatus()).toBe(403);
      expect((error as { getResponse(): unknown }).getResponse()).toMatchObject({
        error: 'VERIFY_SIGN_IN_REQUIRED',
      });
      expect(authRepositoryMock.markEmailVerificationTokenUsed).not.toHaveBeenCalled();
      expect(authRepositoryMock.markEmailVerified).not.toHaveBeenCalled();
      expect(authRepositoryMock.revokeAllUserTokens).not.toHaveBeenCalled();
      expect(claimPortMock.claimGuestOrders).not.toHaveBeenCalled();

      // …and the same link then works for the account holder, signed in.
      await expect(service.confirm('raw', 'user-1')).resolves.toMatchObject({
        email: 'current@example.com',
      });
      expect(authRepositoryMock.markEmailVerificationTokenUsed).toHaveBeenCalledWith('tok-1');
    });

    it('refuses a click signed in as SOMEBODY ELSE the same way', async () => {
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(
        tokenRow({ user: passwordUser }),
      );

      await expect(service.confirm('raw', 'user-2')).rejects.toMatchObject({
        response: expect.objectContaining({ error: 'VERIFY_SIGN_IN_REQUIRED' }),
      });
      expect(authRepositoryMock.markEmailVerificationTokenUsed).not.toHaveBeenCalled();
    });

    it('signed in as the owner: verifies and claims, keeps every session, mints none', async () => {
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(
        tokenRow({ user: passwordUser }),
      );
      claimPortMock.claimGuestOrders.mockResolvedValue(2);

      await expect(service.confirm('raw', 'user-1')).resolves.toEqual({
        email: 'current@example.com',
        claimedOrders: 2,
        signIn: null,
      });
      expect(authRepositoryMock.markEmailVerified).toHaveBeenCalledWith('user-1', expect.any(Date));
      // The registrant proved password AND mailbox — nobody to sign out.
      expect(authRepositoryMock.revokeAllUserTokens).not.toHaveBeenCalled();
      expect(claimPortMock.claimGuestOrders).toHaveBeenCalledWith('user-1', 'current@example.com');
    });
  });

  describe('confirm — a password-less account (checkout / Google)', () => {
    it('revokes, stamps and claims in that order, and asks for a session for the clicker', async () => {
      authRepositoryMock.findEmailVerificationToken.mockResolvedValue(tokenRow());

      await expect(service.confirm('raw', null)).resolves.toEqual({
        email: 'current@example.com',
        claimedOrders: 0,
        signIn: { userId: 'user-1', role: 'CUSTOMER' },
      });

      const revoked = authRepositoryMock.revokeAllUserTokens.mock.invocationCallOrder[0];
      const verified = authRepositoryMock.markEmailVerified.mock.invocationCallOrder[0];
      const claimed = claimPortMock.claimGuestOrders.mock.invocationCallOrder[0];
      expect(revoked).toBeLessThan(verified);
      expect(verified).toBeLessThan(claimed);
    });
  });

  describe('adoptProvenAddress', () => {
    it('revokes, stamps and claims, in that order, for an unproven account', async () => {
      claimPortMock.claimGuestOrders.mockResolvedValue(2);

      await expect(
        service.adoptProvenAddress({ id: 'user-1', emailVerifiedAt: null }, 'a@example.com'),
      ).resolves.toBe(2);

      const revoked = authRepositoryMock.revokeAllUserTokens.mock.invocationCallOrder[0];
      const verified = authRepositoryMock.markEmailVerified.mock.invocationCallOrder[0];
      const claimed = claimPortMock.claimGuestOrders.mock.invocationCallOrder[0];
      expect(revoked).toBeLessThan(verified);
      expect(verified).toBeLessThan(claimed);
      expect(claimPortMock.claimGuestOrders).toHaveBeenCalledWith('user-1', 'a@example.com');
    });

    it('neither revokes nor re-stamps an already proven account, and still claims', async () => {
      await service.adoptProvenAddress(
        { id: 'user-1', emailVerifiedAt: new Date('2026-10-01') },
        'a@example.com',
      );

      expect(authRepositoryMock.revokeAllUserTokens).not.toHaveBeenCalled();
      expect(authRepositoryMock.markEmailVerified).not.toHaveBeenCalled();
      expect(claimPortMock.claimGuestOrders).toHaveBeenCalledWith('user-1', 'a@example.com');
    });
  });

  // ─── TASK-2010: the «Задайте пароль» link of a checkout sign-up ─────────────

  describe('issueAccountSetupLink', () => {
    const tx = { marker: 'tx' } as never;

    it('stores an ACCOUNT_SETUP token for the address and queues the letter, in the caller tx', async () => {
      await service.issueAccountSetupLink({ id: 'user-1', email: 'new@example.com' }, tx);

      expect(authRepositoryMock.saveEmailVerificationToken).toHaveBeenCalledWith(
        'user-1',
        'new@example.com',
        expect.stringMatching(/^[0-9a-f]{64}$/),
        expect.any(Date),
        { purpose: 'ACCOUNT_SETUP' },
        tx,
      );
      const rawToken = authRepositoryMock.saveEmailVerificationToken.mock.calls[0][2] as string;
      expect(mailOutboxMock.enqueueAccountSetup).toHaveBeenCalledWith(
        {
          to: 'new@example.com',
          setupUrl: `http://localhost:3000/account-setup?token=${rawToken}`,
          expiresInHuman: expect.any(String),
        },
        tx,
      );
    });

    it('gives the link the same 24-hour life as a verification link', async () => {
      const before = Date.now();

      await service.issueAccountSetupLink({ id: 'user-1', email: 'new@example.com' }, tx);

      const expiresAt = authRepositoryMock.saveEmailVerificationToken.mock.calls[0][3] as Date;
      const day = 24 * 60 * 60 * 1000;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + day);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + day);
    });

    it('never logs the raw token or the link', async () => {
      await service.issueAccountSetupLink({ id: 'user-1', email: 'new@example.com' }, tx);

      const rawToken = authRepositoryMock.saveEmailVerificationToken.mock.calls[0][2] as string;
      expect(JSON.stringify(loggerMock.info.mock.calls)).not.toContain(rawToken);
    });
  });
});
