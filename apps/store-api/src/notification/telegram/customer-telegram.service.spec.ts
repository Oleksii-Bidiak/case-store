import { ConflictException } from '@nestjs/common';
import { NotificationAudience, NotificationChannel } from '@prisma/client';
import type { NotificationBindingService } from '../notification-binding.service';
import type { TelegramChannelSnapshot, TelegramChannelState } from './telegram-channel.state';
import { CustomerTelegramService } from './customer-telegram.service';

const EXPIRES = new Date('2026-10-07T12:15:00.000Z');

function chat(id: string, label: string | null, createdAt: string) {
  return {
    id,
    channel: NotificationChannel.TELEGRAM,
    audience: NotificationAudience.CUSTOMER,
    externalId: id,
    label,
    userId: 'user-1',
    orderId: null,
    createdAt: new Date(createdAt),
    revokedAt: null,
  };
}

describe('CustomerTelegramService (TASK-679)', () => {
  let snapshot: TelegramChannelSnapshot;
  const state = { ensureFresh: jest.fn(() => Promise.resolve(snapshot)) };
  const bindings = {
    findActiveForCustomer: jest.fn(),
    issueToken: jest.fn(),
    revokeForCustomer: jest.fn(),
  };
  const service = new CustomerTelegramService(
    state as unknown as TelegramChannelState,
    bindings as unknown as NotificationBindingService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    snapshot = { state: 'ok', botUsername: 'shop_bot', checkedAt: new Date() };
    bindings.findActiveForCustomer.mockResolvedValue([]);
    bindings.issueToken.mockResolvedValue({ token: 'tok_en-123', expiresAt: EXPIRES });
    bindings.revokeForCustomer.mockResolvedValue(1);
  });

  describe('status', () => {
    it('ok and nothing connected: available, not connected, the bot named', async () => {
      await expect(service.status({ userId: 'user-1' })).resolves.toEqual({
        available: true,
        connected: false,
        botUsername: 'shop_bot',
      });
      expect(bindings.findActiveForCustomer).toHaveBeenCalledWith({ userId: 'user-1' });
    });

    it('connected: the most recent chat names the connection', async () => {
      bindings.findActiveForCustomer.mockResolvedValue([
        chat('1', '@old', '2026-10-01T00:00:00.000Z'),
        chat('2', '@olena', '2026-10-07T10:00:00.000Z'),
      ]);

      await expect(service.status({ orderId: 'order-a' })).resolves.toEqual({
        available: true,
        connected: true,
        label: '@olena',
        createdAt: new Date('2026-10-07T10:00:00.000Z'),
        botUsername: 'shop_bot',
      });
      expect(bindings.findActiveForCustomer).toHaveBeenCalledWith({ orderId: 'order-a' });
    });

    it.each<TelegramChannelSnapshot>([
      { state: 'unconfigured' },
      {
        state: 'failed',
        reason: 'Telegram getMe failed (401): Unauthorized',
        checkedAt: new Date(),
      },
    ])('bot $state: SAYS unavailable, with no reason and no bot name', async (s) => {
      snapshot = s;

      const status = await service.status({ userId: 'user-1' });

      expect(status).toEqual({ available: false, connected: false });
    });

    it('a chat stays reported as connected while the bot is down', async () => {
      snapshot = { state: 'unconfigured' };
      bindings.findActiveForCustomer.mockResolvedValue([
        chat('1', null, '2026-10-07T10:00:00.000Z'),
      ]);

      await expect(service.status({ userId: 'user-1' })).resolves.toEqual({
        available: false,
        connected: true,
        createdAt: new Date('2026-10-07T10:00:00.000Z'),
      });
    });
  });

  describe('createLink', () => {
    it('a CUSTOMER token carrying the account, as a private deep link only', async () => {
      await expect(service.createLink({ userId: 'user-1' })).resolves.toEqual({
        deepLink: 'https://t.me/shop_bot?start=tok_en-123',
        expiresAt: EXPIRES,
      });
      expect(bindings.issueToken).toHaveBeenCalledWith({
        channel: NotificationChannel.TELEGRAM,
        audience: NotificationAudience.CUSTOMER,
        userId: 'user-1',
      });
    });

    it('a guest token carries the order, never an account', async () => {
      await service.createLink({ orderId: 'order-a' });

      expect(bindings.issueToken).toHaveBeenCalledWith({
        channel: NotificationChannel.TELEGRAM,
        audience: NotificationAudience.CUSTOMER,
        orderId: 'order-a',
      });
    });

    it('409 while the bot is not usable, and no token is issued', async () => {
      snapshot = { state: 'unconfigured' };

      await expect(service.createLink({ userId: 'user-1' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(bindings.issueToken).not.toHaveBeenCalled();
    });
  });

  it('revoke forwards the one owner, on TELEGRAM', async () => {
    await expect(service.revoke({ userId: 'user-1' })).resolves.toBe(1);
    expect(bindings.revokeForCustomer).toHaveBeenCalledWith(
      { userId: 'user-1' },
      NotificationChannel.TELEGRAM,
    );
  });
});
