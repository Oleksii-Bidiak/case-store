import { NotFoundException } from '@nestjs/common';
import { NotificationAudience, NotificationChannel } from '@prisma/client';
import { createHash } from 'crypto';
import {
  BINDING_TOKEN_PATTERN,
  BINDING_TOKEN_TTL_MS,
  hashBindingToken,
  NotificationBindingService,
} from './notification-binding.service';
import type { NotificationBindingRepository } from './notification-binding.repository';

const NOW = new Date('2026-10-01T12:00:00.000Z');

describe('NotificationBindingService', () => {
  const repository = {
    createToken: jest.fn(),
    consumeToken: jest.fn(),
    findActive: jest.fn(),
    listActiveWithUser: jest.fn(),
    hasActive: jest.fn(),
    revoke: jest.fn(),
    revokeByExternalId: jest.fn(),
    findActiveForCustomer: jest.fn(),
    revokeForCustomer: jest.fn(),
    getOffset: jest.fn(),
    saveOffset: jest.fn(),
  };
  let service: NotificationBindingService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
    service = new NotificationBindingService(
      repository as unknown as NotificationBindingRepository,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('issueToken', () => {
    it('returns a 43-char base64url token that fits a Telegram start parameter', async () => {
      const { token } = await service.issueToken({
        channel: NotificationChannel.TELEGRAM,
        audience: NotificationAudience.SHOP,
        userId: 'user-1',
      });

      expect(token).toHaveLength(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(token).toMatch(BINDING_TOKEN_PATTERN);
    });

    it('stores only the sha256 of the token, with a 15-minute expiry', async () => {
      const { token, expiresAt } = await service.issueToken({
        channel: NotificationChannel.TELEGRAM,
        audience: NotificationAudience.SHOP,
        userId: 'user-1',
      });

      expect(expiresAt).toEqual(new Date(NOW.getTime() + BINDING_TOKEN_TTL_MS));
      expect(BINDING_TOKEN_TTL_MS).toBe(15 * 60 * 1000);
      expect(repository.createToken).toHaveBeenCalledWith({
        tokenHash: createHash('sha256').update(token).digest('hex'),
        channel: NotificationChannel.TELEGRAM,
        audience: NotificationAudience.SHOP,
        userId: 'user-1',
        orderId: null,
        expiresAt,
      });
      const stored = JSON.stringify(repository.createToken.mock.calls[0][0]);
      expect(stored).not.toContain(token);
    });

    it('issues a different token every time', async () => {
      const params = {
        channel: NotificationChannel.TELEGRAM,
        audience: NotificationAudience.CUSTOMER,
        orderId: 'order-1',
      };
      const a = await service.issueToken(params);
      const b = await service.issueToken(params);

      expect(a.token).not.toBe(b.token);
    });
  });

  describe('consumeToken', () => {
    const token = 'A'.repeat(43);

    it('passes the hash, the chat id as a string and the trimmed label to the repository', async () => {
      repository.consumeToken.mockResolvedValue({ ok: false, reason: 'invalid' });

      await service.consumeToken(token, {
        id: -1001234567890,
        label: '  Магазин  ',
        isPrivate: false,
      });

      expect(repository.consumeToken).toHaveBeenCalledWith(
        hashBindingToken(token),
        { externalId: '-1001234567890', label: 'Магазин', isPrivate: false },
        NOW,
      );
    });

    it('stores an empty label as null', async () => {
      repository.consumeToken.mockResolvedValue({ ok: false, reason: 'invalid' });

      await service.consumeToken(token, { id: 42, label: '   ', isPrivate: true });

      expect(repository.consumeToken).toHaveBeenCalledWith(
        expect.any(String),
        { externalId: '42', label: null, isPrivate: true },
        NOW,
      );
    });

    it.each([
      'short',
      'has spaces in it but is long enough',
      'x'.repeat(65),
      'тільки-кирилиця-що-довша-за-двадцять',
    ])('refuses %p without asking the database — no token of ours looks like that', async (bad) => {
      await expect(service.consumeToken(bad, { id: 1, isPrivate: true })).resolves.toEqual({
        ok: false,
        reason: 'invalid',
      });
      expect(repository.consumeToken).not.toHaveBeenCalled();
    });

    it('returns the repository outcome unchanged', async () => {
      const outcome = { ok: false, reason: 'expired' };
      repository.consumeToken.mockResolvedValue(outcome);

      await expect(service.consumeToken(token, { id: 1, isPrivate: true })).resolves.toBe(outcome);
    });
  });

  describe('hasActiveRecipient', () => {
    it('passes the scope through: the gate is never audience-blind (TASK-679)', async () => {
      repository.hasActive.mockResolvedValue(false);
      const scope = {
        audience: NotificationAudience.CUSTOMER,
        owner: { userId: 'user-1', orderId: 'order-1' },
      } as const;

      await expect(
        service.hasActiveRecipient(NotificationChannel.TELEGRAM, '777', scope),
      ).resolves.toBe(false);
      expect(repository.hasActive).toHaveBeenCalledWith(NotificationChannel.TELEGRAM, '777', scope);
    });
  });

  describe('revoke', () => {
    const scope = { channel: NotificationChannel.TELEGRAM, audience: NotificationAudience.SHOP };

    it('revokes inside the given channel and audience, stamped now', async () => {
      repository.revoke.mockResolvedValue(true);

      await service.revoke('binding-1', scope);

      expect(repository.revoke).toHaveBeenCalledWith('binding-1', scope, NOW);
    });

    it('404s when there is no such active binding', async () => {
      repository.revoke.mockResolvedValue(false);

      await expect(service.revoke('binding-1', scope)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('revokeByExternalId stamps now and returns how many were revoked', async () => {
    repository.revokeByExternalId.mockResolvedValue(2);

    await expect(service.revokeByExternalId(NotificationChannel.TELEGRAM, '42')).resolves.toBe(2);
    expect(repository.revokeByExternalId).toHaveBeenCalledWith(
      NotificationChannel.TELEGRAM,
      '42',
      NOW,
    );
  });

  it('findActiveRecipients forwards the transaction client (TASK-677 enqueues in the event tx)', async () => {
    const tx = { marker: true };
    repository.findActive.mockResolvedValue([]);

    await service.findActiveRecipients(
      NotificationChannel.TELEGRAM,
      NotificationAudience.SHOP,
      tx as never,
    );

    expect(repository.findActive).toHaveBeenCalledWith(
      NotificationChannel.TELEGRAM,
      NotificationAudience.SHOP,
      tx,
    );
  });

  describe('customer bindings (TASK-679)', () => {
    it('findActiveForCustomer defaults to TELEGRAM and forwards the owner and the tx', async () => {
      const tx = { marker: true };
      repository.findActiveForCustomer.mockResolvedValue([]);

      await service.findActiveForCustomer({ userId: 'user-1', orderId: 'order-1' }, tx as never);

      expect(repository.findActiveForCustomer).toHaveBeenCalledWith(
        NotificationChannel.TELEGRAM,
        { userId: 'user-1', orderId: 'order-1' },
        tx,
      );
    });

    it('revokeForCustomer stamps now, scoped to the one owner, and is idempotent', async () => {
      repository.revokeForCustomer.mockResolvedValue(0);

      await expect(service.revokeForCustomer({ userId: 'user-1' })).resolves.toBe(0);
      expect(repository.revokeForCustomer).toHaveBeenCalledWith(
        NotificationChannel.TELEGRAM,
        { userId: 'user-1' },
        NOW,
      );
    });
  });
});
