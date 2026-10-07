import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';
import { NotificationAudience, NotificationChannel } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import type { NotificationBindingService } from '../notification-binding.service';
import { TelegramApiError, type TelegramClient, type TelegramUpdate } from './telegram.client';
import type { TelegramChannelSnapshot, TelegramChannelState } from './telegram-channel.state';
import {
  TELEGRAM_REPLIES,
  TELEGRAM_UPDATES_BATCH,
  TELEGRAM_UPDATES_CRON,
  TELEGRAM_UPDATES_JOB_NAME,
  TelegramUpdatesWorker,
} from './telegram-updates.worker';

const TOKEN = 'Zm9vYmFyYmF6cXV4cXV1eHF1dXhxdXV4cXV1eHF1dXg';

function update(
  id: number,
  text: string | undefined,
  chat: NonNullable<TelegramUpdate['message']>['chat'] = {
    id: 777,
    type: 'private',
    first_name: 'Олена',
  },
): TelegramUpdate {
  return { update_id: id, message: { message_id: id, date: 0, text, chat } };
}

const bound = (audience: NotificationAudience = NotificationAudience.SHOP) => ({
  ok: true,
  created: true,
  binding: {
    id: 'binding-1',
    channel: NotificationChannel.TELEGRAM,
    audience,
    externalId: '777',
    label: 'Олена',
    userId: 'user-1',
    orderId: null,
    createdAt: new Date(),
    revokedAt: null,
  },
});

describe('TelegramUpdatesWorker', () => {
  const client = {
    isConfigured: jest.fn(),
    getUpdates: jest.fn(),
    sendMessage: jest.fn(),
  };
  let snapshot: TelegramChannelSnapshot;
  const state = { ensureFresh: jest.fn(() => Promise.resolve(snapshot)) };
  const bindings = {
    getOffset: jest.fn(),
    saveOffset: jest.fn(),
    consumeToken: jest.fn(),
  };
  const config = { get: jest.fn() };
  const scheduler = { addCronJob: jest.fn(), deleteCronJob: jest.fn() };
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  let worker: TelegramUpdatesWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    snapshot = { state: 'ok', botUsername: 'shop_bot', checkedAt: new Date() };
    client.isConfigured.mockReturnValue(true);
    client.getUpdates.mockResolvedValue([]);
    client.sendMessage.mockResolvedValue({ message_id: 1 });
    bindings.getOffset.mockResolvedValue(100);
    bindings.saveOffset.mockResolvedValue(undefined);
    bindings.consumeToken.mockResolvedValue(bound());
    config.get.mockReturnValue(undefined);
    worker = new TelegramUpdatesWorker(
      client as unknown as TelegramClient,
      state as unknown as TelegramChannelState,
      bindings as unknown as NotificationBindingService,
      config as unknown as ConfigService,
      scheduler as unknown as SchedulerRegistry,
      logger as unknown as PinoLogger,
    );
  });

  /** Every string any log call received, flattened — to prove the token is in none of them. */
  const everythingLogged = () =>
    JSON.stringify([
      ...logger.info.mock.calls,
      ...logger.warn.mock.calls,
      ...logger.error.mock.calls,
      ...logger.debug.mock.calls,
    ]);

  describe('onModuleInit', () => {
    it('registers a 10-second cron job', () => {
      worker.onModuleInit();

      expect(scheduler.addCronJob).toHaveBeenCalledWith(
        TELEGRAM_UPDATES_JOB_NAME,
        expect.anything(),
      );
      const job = scheduler.addCronJob.mock.calls[0][1];
      expect(job.cronTime.source).toBe(TELEGRAM_UPDATES_CRON);
      expect(TELEGRAM_UPDATES_CRON).toBe('*/10 * * * * *');
      job.stop();
    });

    it('registers nothing when scheduling is disabled', () => {
      config.get.mockImplementation((key: string) =>
        key === 'SCHEDULER_ENABLED' ? 'false' : undefined,
      );

      worker.onModuleInit();

      expect(scheduler.addCronJob).not.toHaveBeenCalled();
    });

    it('registers nothing without a bot token — that cannot change before a restart', () => {
      client.isConfigured.mockReturnValue(false);

      worker.onModuleInit();

      expect(scheduler.addCronJob).not.toHaveBeenCalled();
    });

    it('onModuleDestroy unregisters the job', () => {
      worker.onModuleDestroy();

      expect(scheduler.deleteCronJob).toHaveBeenCalledWith(TELEGRAM_UPDATES_JOB_NAME);
    });
  });

  describe('tick', () => {
    it('short-polls from the stored offset', async () => {
      await worker.tick();

      expect(client.getUpdates).toHaveBeenCalledWith(100, {
        timeoutSec: 0,
        limit: TELEGRAM_UPDATES_BATCH,
      });
      expect(bindings.saveOffset).not.toHaveBeenCalled();
    });

    it.each<TelegramChannelSnapshot>([
      { state: 'unconfigured' },
      { state: 'failed', reason: 'Unauthorized', checkedAt: new Date() },
    ])('does nothing while the channel is $state', async (s) => {
      snapshot = s;

      await worker.tick();

      expect(state.ensureFresh).toHaveBeenCalled();
      expect(client.getUpdates).not.toHaveBeenCalled();
    });

    it.each([
      ['/start <token>', `/start ${TOKEN}`],
      ['/start@BotName <token> (a group)', `/start@shop_bot ${TOKEN}`],
      ['surrounding whitespace', `  /start   ${TOKEN}  `],
    ])('exchanges %s and confirms in the chat', async (_label, text) => {
      client.getUpdates.mockResolvedValue([update(100, text)]);

      await worker.tick();

      expect(bindings.consumeToken).toHaveBeenCalledWith(TOKEN, {
        id: '777',
        label: 'Олена',
        isPrivate: true,
      });
      expect(client.sendMessage).toHaveBeenCalledWith('777', TELEGRAM_REPLIES.boundShop);
      expect(bindings.saveOffset).toHaveBeenCalledWith(NotificationChannel.TELEGRAM, 101);
    });

    it('confirms a CUSTOMER binding with the customer wording', async () => {
      bindings.consumeToken.mockResolvedValue(bound(NotificationAudience.CUSTOMER));
      client.getUpdates.mockResolvedValue([update(100, `/start ${TOKEN}`)]);

      await worker.tick();

      expect(client.sendMessage).toHaveBeenCalledWith('777', TELEGRAM_REPLIES.boundCustomer);
    });

    it.each([
      ['a group title', { id: -100, type: 'supergroup', title: 'Замовлення' }, 'Замовлення'],
      ['a username', { id: 5, type: 'private', username: 'olena', first_name: 'Олена' }, '@olena'],
      ['a first name only', { id: 5, type: 'private', first_name: 'Олена' }, 'Олена'],
    ])('labels the chat by %s', async (_label, chat, expected) => {
      client.getUpdates.mockResolvedValue([update(100, `/start ${TOKEN}`, chat)]);

      await worker.tick();

      expect(bindings.consumeToken).toHaveBeenCalledWith(TOKEN, {
        id: String(chat.id),
        label: expected,
        isPrivate: chat.type === 'private',
      });
    });

    // TASK-679: customer links are for a private chat only (plan 187).
    it.each([
      ['a group', 'group'],
      ['a supergroup', 'supergroup'],
      ['a channel', 'channel'],
    ])('tells the repository that %s is not a private chat', async (_label, type) => {
      client.getUpdates.mockResolvedValue([
        update(100, `/start@shop_bot ${TOKEN}`, { id: -100, type, title: 'Сім’я' }),
      ]);

      await worker.tick();

      expect(bindings.consumeToken).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({ id: '-100', isPrivate: false }),
      );
    });

    it('answers a customer link sent from a group with the private-chat hint, and logs no token', async () => {
      bindings.consumeToken.mockResolvedValue({ ok: false, reason: 'private-only' });
      client.getUpdates.mockResolvedValue([
        update(100, `/start@shop_bot ${TOKEN}`, { id: -100, type: 'group', title: 'Сім’я' }),
      ]);

      await worker.tick();

      expect(client.sendMessage).toHaveBeenCalledWith('-100', TELEGRAM_REPLIES.privateOnly);
      expect(client.sendMessage).not.toHaveBeenCalledWith('-100', TELEGRAM_REPLIES.boundCustomer);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'telegram.binding.refused', reason: 'private-only' }),
        expect.any(String),
      );
      expect(everythingLogged()).not.toContain(TOKEN);
    });

    it('the private-chat hint sends the customer back to the site for a new link', () => {
      expect(TELEGRAM_REPLIES.privateOnly).toMatch(/особистий чат/);
      expect(TELEGRAM_REPLIES.privateOnly).toMatch(/на сайті/);
    });

    it.each(['invalid', 'expired'] as const)(
      'answers a %s token with the same refusal, and logs no token',
      async (reason) => {
        bindings.consumeToken.mockResolvedValue({ ok: false, reason });
        client.getUpdates.mockResolvedValue([update(100, `/start ${TOKEN}`)]);

        await worker.tick();

        expect(client.sendMessage).toHaveBeenCalledWith('777', TELEGRAM_REPLIES.invalid);
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ event: 'telegram.binding.refused', reason, chatId: '777' }),
          expect.any(String),
        );
        expect(everythingLogged()).not.toContain(TOKEN);
        expect(bindings.saveOffset).toHaveBeenCalledWith(NotificationChannel.TELEGRAM, 101);
      },
    );

    // TASK-679: a customer gets the same two replies as an operator — neither may
    // send them to an admin panel they have never seen.
    it.each(['invalid', 'bareStart'] as const)(
      'the %s reply serves customers too: it names the site, not only the admin',
      (key) => {
        expect(TELEGRAM_REPLIES[key]).toMatch(/на сайті/);
        expect(TELEGRAM_REPLIES[key]).not.toMatch(/Створіть нове в адмінці/);
      },
    );

    it('answers a bare /start with a hint and exchanges nothing', async () => {
      client.getUpdates.mockResolvedValue([update(100, '/start')]);

      await worker.tick();

      expect(bindings.consumeToken).not.toHaveBeenCalled();
      expect(client.sendMessage).toHaveBeenCalledWith('777', TELEGRAM_REPLIES.bareStart);
    });

    it.each([
      ['ordinary text', 'Привіт'],
      ['another command', '/help'],
      ['a token without /start', TOKEN],
      ['/started', `/started ${TOKEN}`],
      ['no text at all (a photo)', undefined],
    ])('ignores %s but still moves the offset past it', async (_label, text) => {
      client.getUpdates.mockResolvedValue([update(100, text)]);

      await worker.tick();

      expect(bindings.consumeToken).not.toHaveBeenCalled();
      expect(client.sendMessage).not.toHaveBeenCalled();
      expect(bindings.saveOffset).toHaveBeenCalledWith(NotificationChannel.TELEGRAM, 101);
    });

    it('saves the offset once per batch, after the last update', async () => {
      client.getUpdates.mockResolvedValue([
        update(100, 'hi'),
        update(101, `/start ${TOKEN}`),
        update(105, 'bye'),
      ]);

      await worker.tick();

      expect(bindings.saveOffset).toHaveBeenCalledTimes(1);
      expect(bindings.saveOffset).toHaveBeenCalledWith(NotificationChannel.TELEGRAM, 106);
    });

    it('a failed exchange keeps the updates before it done and retries it next tick', async () => {
      bindings.consumeToken.mockRejectedValue(new Error('db down'));
      client.getUpdates.mockResolvedValue([update(100, 'hi'), update(101, `/start ${TOKEN}`)]);

      await expect(worker.tick()).resolves.toBeUndefined();

      expect(bindings.saveOffset).toHaveBeenCalledWith(NotificationChannel.TELEGRAM, 101);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'telegram.updates.failed' }),
        expect.any(String),
      );
      expect(everythingLogged()).not.toContain(TOKEN);
    });

    it('a failed reply does not undo the binding or stop the batch', async () => {
      client.sendMessage.mockRejectedValue(
        new TelegramApiError(
          'Telegram sendMessage failed (403): Forbidden',
          'permanent',
          'sendMessage',
          403,
        ),
      );
      client.getUpdates.mockResolvedValue([update(100, `/start ${TOKEN}`), update(101, '/start')]);

      await worker.tick();

      expect(client.sendMessage).toHaveBeenCalledTimes(2);
      expect(bindings.saveOffset).toHaveBeenCalledWith(NotificationChannel.TELEGRAM, 102);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'telegram.updates.replyFailed' }),
        expect.any(String),
      );
    });

    it('never throws when getUpdates fails, and saves no offset', async () => {
      client.getUpdates.mockRejectedValue(
        new TelegramApiError(
          'Telegram getUpdates failed (409): Conflict',
          'transient',
          'getUpdates',
          409,
        ),
      );

      await expect(worker.tick()).resolves.toBeUndefined();
      expect(bindings.saveOffset).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'telegram.updates.failed' }),
        expect.any(String),
      );
    });

    it('skips a tick while the previous one is still running', async () => {
      let release!: (updates: TelegramUpdate[]) => void;
      client.getUpdates.mockReturnValueOnce(
        new Promise<TelegramUpdate[]>((resolve) => {
          release = resolve;
        }),
      );

      const first = worker.tick();
      await new Promise((resolve) => setImmediate(resolve));
      await worker.tick();

      expect(client.getUpdates).toHaveBeenCalledTimes(1);

      release([]);
      await first;
      await worker.tick();
      expect(client.getUpdates).toHaveBeenCalledTimes(2);
    });
  });
});
