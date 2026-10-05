import { ConflictException } from '@nestjs/common';
import { NotificationAudience, NotificationChannel } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import type { NotificationBindingService } from '../notification-binding.service';
import { TELEGRAM_TEST_MESSAGE, TelegramAdminService } from './telegram-admin.service';
import { TelegramApiError, type TelegramClient } from './telegram.client';
import type { TelegramChannelSnapshot, TelegramChannelState } from './telegram-channel.state';

const SHOP = { channel: NotificationChannel.TELEGRAM, audience: NotificationAudience.SHOP };

const binding = (id: string, externalId: string) => ({
  id,
  ...SHOP,
  externalId,
  label: null,
  userId: null,
  orderId: null,
  createdAt: new Date(),
  revokedAt: null,
});

describe('TelegramAdminService', () => {
  const client = { sendMessage: jest.fn() };
  let snapshot: TelegramChannelSnapshot;
  const state = { ensureFresh: jest.fn(() => Promise.resolve(snapshot)), markFailed: jest.fn() };
  const bindings = {
    issueToken: jest.fn(),
    listActive: jest.fn(),
    findActiveRecipients: jest.fn(),
    revoke: jest.fn(),
    revokeByExternalId: jest.fn(),
  };
  const logger = { setContext: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() };
  let service: TelegramAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    snapshot = { state: 'ok', botUsername: 'shop_bot', checkedAt: new Date() };
    client.sendMessage.mockResolvedValue({ message_id: 1 });
    bindings.revokeByExternalId.mockResolvedValue(1);
    service = new TelegramAdminService(
      client as unknown as TelegramClient,
      state as unknown as TelegramChannelState,
      bindings as unknown as NotificationBindingService,
      logger as unknown as PinoLogger,
    );
  });

  describe('createShopLink', () => {
    it('issues a SHOP token for the caller and builds both deep links from the bot name', async () => {
      const expiresAt = new Date('2026-10-01T12:15:00.000Z');
      bindings.issueToken.mockResolvedValue({ token: 'tok_en-1', expiresAt });

      await expect(service.createShopLink('user-1')).resolves.toEqual({
        deepLink: 'https://t.me/shop_bot?start=tok_en-1',
        groupDeepLink: 'https://t.me/shop_bot?startgroup=tok_en-1',
        expiresAt,
      });
      expect(bindings.issueToken).toHaveBeenCalledWith({ ...SHOP, userId: 'user-1' });
    });

    it.each<TelegramChannelSnapshot>([
      { state: 'unconfigured' },
      { state: 'failed', reason: 'Unauthorized', checkedAt: new Date() },
    ])('409s and issues nothing while the channel is $state', async (s) => {
      snapshot = s;

      await expect(service.createShopLink('user-1')).rejects.toBeInstanceOf(ConflictException);
      expect(bindings.issueToken).not.toHaveBeenCalled();
    });
  });

  describe('sendTest', () => {
    it('sends the test message to every active shop chat and reports each', async () => {
      bindings.findActiveRecipients.mockResolvedValue([binding('b1', '1'), binding('b2', '-100')]);

      await expect(service.sendTest()).resolves.toEqual([
        { bindingId: 'b1', ok: true },
        { bindingId: 'b2', ok: true },
      ]);
      expect(bindings.findActiveRecipients).toHaveBeenCalledWith(SHOP.channel, SHOP.audience);
      expect(client.sendMessage).toHaveBeenCalledWith('1', TELEGRAM_TEST_MESSAGE);
      expect(client.sendMessage).toHaveBeenCalledWith('-100', TELEGRAM_TEST_MESSAGE);
    });

    it('revokes a chat Telegram says is gone, and keeps going', async () => {
      bindings.findActiveRecipients.mockResolvedValue([binding('b1', '1'), binding('b2', '2')]);
      const blocked = new TelegramApiError(
        'Telegram sendMessage failed (403): Forbidden: bot was blocked by the user',
        'permanent',
        'sendMessage',
        403,
      );
      client.sendMessage.mockRejectedValueOnce(blocked);

      await expect(service.sendTest()).resolves.toEqual([
        { bindingId: 'b1', ok: false, error: blocked.message, revoked: true },
        { bindingId: 'b2', ok: true },
      ]);
      expect(bindings.revokeByExternalId).toHaveBeenCalledWith(NotificationChannel.TELEGRAM, '1');
    });

    it('reports a transient failure without revoking anything', async () => {
      bindings.findActiveRecipients.mockResolvedValue([binding('b1', '1')]);
      client.sendMessage.mockRejectedValue(
        new TelegramApiError(
          'Telegram sendMessage request failed: timed out',
          'transient',
          'sendMessage',
        ),
      );

      await expect(service.sendTest()).resolves.toEqual([
        { bindingId: 'b1', ok: false, error: 'Telegram sendMessage request failed: timed out' },
      ]);
      expect(bindings.revokeByExternalId).not.toHaveBeenCalled();
    });

    it('a rejected token fails the channel, not the chat', async () => {
      bindings.findActiveRecipients.mockResolvedValue([binding('b1', '1')]);
      const message = 'Telegram sendMessage failed (401): Unauthorized';
      client.sendMessage.mockRejectedValue(
        new TelegramApiError(message, 'permanent', 'sendMessage', 401),
      );

      await service.sendTest();

      expect(state.markFailed).toHaveBeenCalledWith(message);
      expect(bindings.revokeByExternalId).not.toHaveBeenCalled();
    });

    it('409s when no chat is connected', async () => {
      bindings.findActiveRecipients.mockResolvedValue([]);

      await expect(service.sendTest()).rejects.toBeInstanceOf(ConflictException);
      expect(client.sendMessage).not.toHaveBeenCalled();
    });

    it('409s while the channel is not ok, before reading any binding', async () => {
      snapshot = { state: 'unconfigured' };

      await expect(service.sendTest()).rejects.toBeInstanceOf(ConflictException);
      expect(bindings.findActiveRecipients).not.toHaveBeenCalled();
    });
  });

  it('revokeShopBinding is scoped to TELEGRAM + SHOP', async () => {
    bindings.revoke.mockResolvedValue(undefined);

    await service.revokeShopBinding('b1');

    expect(bindings.revoke).toHaveBeenCalledWith('b1', SHOP);
  });
});
