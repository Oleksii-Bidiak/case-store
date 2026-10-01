import { NotificationChannel, NotificationOutbox, NotificationOutboxStatus } from '@prisma/client';
import { PermanentDeliveryError } from '../../notification-outbox/channels/notification-channel-adapter';
import { TelegramAdapter } from './telegram.adapter';
import { TelegramApiError, type TelegramClient } from './telegram.client';
import type { TelegramChannelSnapshot, TelegramChannelState } from './telegram-channel.state';
import { TelegramRendererRegistry } from './telegram-renderers';
import { escapeHtml } from './telegram-html';

const makeRow = (overrides: Partial<NotificationOutbox> = {}): NotificationOutbox => ({
  id: 'row-1',
  type: 'test-ping',
  channel: NotificationChannel.TELEGRAM,
  recipientAddress: '-1001234567890',
  payload: { name: 'Олена <script>' },
  status: NotificationOutboxStatus.PENDING,
  attempts: 0,
  maxAttempts: 5,
  lastError: null,
  nextAttemptAt: new Date('2026-10-01T12:00:00.000Z'),
  createdAt: new Date('2026-10-01T12:00:00.000Z'),
  sentAt: null,
  ...overrides,
});

describe('TelegramAdapter', () => {
  const client = { sendMessage: jest.fn() };
  let snapshot: TelegramChannelSnapshot;
  const state = {
    isOk: jest.fn(() => snapshot.state === 'ok'),
    ensureFresh: jest.fn(() => Promise.resolve(snapshot)),
    markFailed: jest.fn(),
  };
  let renderers: TelegramRendererRegistry;
  let adapter: TelegramAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    snapshot = { state: 'ok', botUsername: 'shop_bot', checkedAt: new Date() };
    client.sendMessage.mockResolvedValue({ message_id: 1 });
    renderers = new TelegramRendererRegistry();
    renderers.register('test-ping', (row) => {
      const { name } = row.payload as { name: string };
      return `<b>Привіт</b>, ${escapeHtml(name)}`;
    });
    adapter = new TelegramAdapter(
      client as unknown as TelegramClient,
      state as unknown as TelegramChannelState,
      renderers,
    );
  });

  it('serves the TELEGRAM channel', () => {
    expect(adapter.channel).toBe(NotificationChannel.TELEGRAM);
  });

  describe('send', () => {
    it('renders the row and sends it to recipientAddress as chat_id, in HTML, without previews', async () => {
      await adapter.send(makeRow());

      expect(client.sendMessage).toHaveBeenCalledWith(
        '-1001234567890',
        '<b>Привіт</b>, Олена &lt;script&gt;',
        { parseMode: 'HTML', disableWebPagePreview: true },
      );
    });

    it('an unknown type throws a plain (transient) Error and sends nothing', async () => {
      const sent = adapter.send(makeRow({ type: 'no-such-type' }));

      await expect(sent).rejects.toThrow('Unknown Telegram outbox type: no-such-type');
      await expect(sent).rejects.not.toBeInstanceOf(PermanentDeliveryError);
      expect(client.sendMessage).not.toHaveBeenCalled();
    });

    it.each([
      [400, 'Bad Request: chat not found'],
      [403, 'Forbidden: bot was blocked by the user'],
    ])(
      'a permanent %i becomes PermanentDeliveryError, so the row is not retried',
      async (code, desc) => {
        const message = `Telegram sendMessage failed (${code}): ${desc}`;
        client.sendMessage.mockRejectedValue(
          new TelegramApiError(message, 'permanent', 'sendMessage', code),
        );

        const sent = adapter.send(makeRow());

        await expect(sent).rejects.toBeInstanceOf(PermanentDeliveryError);
        await expect(sent).rejects.toThrow(message);
        expect(state.markFailed).not.toHaveBeenCalled();
      },
    );

    it.each([401, 404])(
      'a rejected TOKEN (%i) fails the channel, not the row: transient Error + markFailed',
      async (code) => {
        const message = `Telegram sendMessage failed (${code}): Unauthorized`;
        client.sendMessage.mockRejectedValue(
          new TelegramApiError(message, 'permanent', 'sendMessage', code),
        );

        const sent = adapter.send(makeRow());

        await expect(sent).rejects.toThrow(message);
        await expect(sent).rejects.not.toBeInstanceOf(PermanentDeliveryError);
        expect(state.markFailed).toHaveBeenCalledWith(message);
      },
    );

    it('a transient API error propagates unchanged for the dispatcher to retry', async () => {
      const err = new TelegramApiError(
        'Telegram sendMessage failed (429): Too Many Requests',
        'transient',
        'sendMessage',
        429,
        3,
      );
      client.sendMessage.mockRejectedValue(err);

      await expect(adapter.send(makeRow())).rejects.toBe(err);
    });
  });

  describe('isEnabled', () => {
    it('is true while the channel is ok, without any re-check', () => {
      expect(adapter.isEnabled()).toBe(true);
      expect(state.ensureFresh).not.toHaveBeenCalled();
    });

    it.each<TelegramChannelSnapshot>([
      { state: 'unconfigured' },
      { state: 'failed', reason: 'down', checkedAt: new Date() },
    ])('is false for $state, and nudges a (rate-limited) re-check', (s) => {
      snapshot = s;

      expect(adapter.isEnabled()).toBe(false);
      expect(state.ensureFresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('healthcheck', () => {
    it.each<[TelegramChannelSnapshot, { state: string; detail?: string }]>([
      [
        { state: 'ok', botUsername: 'shop_bot', checkedAt: new Date() },
        { state: 'ok', detail: '@shop_bot' },
      ],
      [
        { state: 'failed', reason: 'Unauthorized', checkedAt: new Date() },
        { state: 'failed', detail: 'Unauthorized' },
      ],
      [{ state: 'unconfigured' }, { state: 'disabled', detail: 'TELEGRAM_BOT_TOKEN is not set' }],
    ])('maps %o, sending nothing', async (s, expected) => {
      snapshot = s;

      await expect(adapter.healthcheck()).resolves.toEqual(expected);
      expect(client.sendMessage).not.toHaveBeenCalled();
    });
  });
});

describe('TelegramRendererRegistry', () => {
  it('refuses a second renderer for the same type', () => {
    const registry = new TelegramRendererRegistry();
    registry.register('x', () => 'a');

    expect(() => registry.register('x', () => 'b')).toThrow(
      'Duplicate Telegram renderer for type: x',
    );
  });

  it('ships no business renderers yet — TASK-677 adds them', () => {
    expect(new TelegramRendererRegistry().has('order-confirmation')).toBe(false);
  });
});
