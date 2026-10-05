import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { NotificationAudience, NotificationChannel } from '@prisma/client';
import { CronJob } from 'cron';
import { PinoLogger } from 'nestjs-pino';
import { schedulingEnabled, stopCronJob } from '../../common/scheduling';
import { hashBindingToken, NotificationBindingService } from '../notification-binding.service';
import { TelegramClient, type TelegramUpdate } from './telegram.client';
import { TelegramChannelState } from './telegram-channel.state';

/** Registered name of the cron job in {@link SchedulerRegistry}. */
export const TELEGRAM_UPDATES_JOB_NAME = 'telegram-updates-poll';

/**
 * Every ten seconds: the person who just pressed «Старт» is looking at the chat,
 * so the confirmation should arrive while they still are — and a short poll that
 * finds nothing costs one tiny request.
 */
export const TELEGRAM_UPDATES_CRON = '*/10 * * * * *';

/** Updates read per tick. `/start` arrives a few times a day; this is a ceiling, not a rate. */
export const TELEGRAM_UPDATES_BATCH = 50;

/** `/start`, optionally addressed (`/start@ShopBot` — how it arrives in a group), and its payload. */
const START_COMMAND = /^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/;

/** What the bot answers. Plain text — nothing here is HTML-escaped because nothing is interpolated. */
export const TELEGRAM_REPLIES = {
  boundShop: '✅ Готово: цей чат отримуватиме сповіщення магазину.',
  boundCustomer: '✅ Готово: сюди надходитимуть сповіщення про ваші замовлення.',
  invalid: 'Посилання недійсне або прострочене. Створіть нове в адмінці.',
  bareStart:
    'Щоб отримувати сповіщення в цей чат, відкрийте посилання підключення, створене в адмінці магазину.',
} as const;

/**
 * TelegramUpdatesWorker — reads what people send the bot and turns
 * `/start <token>` into a chat binding (TASK-675).
 *
 * Polling, not a webhook (plan 187): one code path for dev and production, no
 * public URL, no secret path in Caddy, and the volume is a handful of `/start`s a
 * day. Registered through {@link SchedulerRegistry} like
 * `NotificationOutboxWorker`, so `SCHEDULER_ENABLED=false` turns it off with the
 * rest; not registered at all without a bot token, since nothing can make that
 * state change without a restart.
 *
 * ## Delivery guarantees
 *
 * At least once. The offset (`last update_id + 1`) is saved after the batch, or
 * up to the last update handled when one fails, so an update is never skipped;
 * one can be seen twice after a crash between handling and saving, which is
 * harmless because exchanging a token is one-time — the repeat is answered
 * "invalid" and binds nothing.
 *
 * ## What is never logged
 *
 * The token or the raw `/start` text (they ARE the credential for the next
 * fifteen minutes) — only the first 8 hex of its SHA-256, enough to correlate
 * with nothing but our own log. Of the person, only the chat id.
 */
@Injectable()
export class TelegramUpdatesWorker implements OnModuleInit, OnModuleDestroy {
  private running = false;

  constructor(
    private readonly client: TelegramClient,
    private readonly state: TelegramChannelState,
    private readonly bindings: NotificationBindingService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TelegramUpdatesWorker.name);
  }

  onModuleInit(): void {
    if (!schedulingEnabled(this.config) || !this.client.isConfigured()) return;
    const job = new CronJob(TELEGRAM_UPDATES_CRON, () => {
      void this.tick();
    });
    this.schedulerRegistry.addCronJob(TELEGRAM_UPDATES_JOB_NAME, job);
    job.start();
    this.logger.info(
      { event: 'telegram.updates.scheduled', cron: TELEGRAM_UPDATES_CRON },
      `Telegram updates poller scheduled (${TELEGRAM_UPDATES_CRON})`,
    );
  }

  /** See {@link stopCronJob} — Nest does not close manually registered jobs. */
  onModuleDestroy(): void {
    stopCronJob(this.schedulerRegistry, TELEGRAM_UPDATES_JOB_NAME);
  }

  /**
   * One poll. Public so specs drive it directly. Skips when the previous tick is
   * still running (a slow Telegram must not stack polls that would race for the
   * same offset) and when the channel is not `ok`. Never throws.
   */
  async tick(): Promise<void> {
    if (this.running) {
      this.logger.debug(
        { event: 'telegram.updates.skipped', reason: 'busy' },
        'Previous poll still running',
      );
      return;
    }
    this.running = true;
    try {
      const snapshot = await this.state.ensureFresh();
      if (snapshot.state !== 'ok') return;
      await this.poll();
    } catch (err) {
      this.logger.error(
        { event: 'telegram.updates.failed', err: describe(err) },
        'Telegram updates poll failed',
      );
    } finally {
      this.running = false;
    }
  }

  private async poll(): Promise<void> {
    const offset = await this.bindings.getOffset(NotificationChannel.TELEGRAM);
    const updates = await this.client.getUpdates(offset, {
      timeoutSec: 0,
      limit: TELEGRAM_UPDATES_BATCH,
    });
    if (updates.length === 0) return;

    let next = offset;
    try {
      for (const update of updates) {
        await this.handle(update);
        next = update.update_id + 1;
      }
    } finally {
      // Saved even when an update failed half-way: everything before it is done
      // and must not be replayed; the failed one is retried next tick.
      if (next !== offset) {
        await this.bindings.saveOffset(NotificationChannel.TELEGRAM, next);
      }
    }
  }

  private async handle(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    const text = message?.text?.trim();
    if (!message || !text) return;

    const command = START_COMMAND.exec(text);
    if (!command) return; // Not ours to answer: the bot only speaks `/start`.

    const chatId = String(message.chat.id);
    const token = command[1];
    if (token === undefined) {
      await this.reply(chatId, TELEGRAM_REPLIES.bareStart);
      return;
    }

    const tokenRef = hashBindingToken(token).slice(0, 8);
    const chat = message.chat;
    const label = chat.title ?? (chat.username ? `@${chat.username}` : (chat.first_name ?? null));
    // A database failure here propagates: the update is retried next tick.
    const result = await this.bindings.consumeToken(token, { id: chatId, label });

    if (!result.ok) {
      this.logger.warn(
        { event: 'telegram.binding.refused', chatId, tokenRef, reason: result.reason },
        `Telegram /start refused (${result.reason})`,
      );
      await this.reply(chatId, TELEGRAM_REPLIES.invalid);
      return;
    }

    const { binding, created } = result;
    this.logger.info(
      {
        event: created ? 'telegram.binding.created' : 'telegram.binding.kept',
        chatId,
        tokenRef,
        bindingId: binding.id,
        audience: binding.audience,
      },
      created ? 'Telegram chat connected' : 'Telegram chat was already connected',
    );
    await this.reply(
      chatId,
      binding.audience === NotificationAudience.SHOP
        ? TELEGRAM_REPLIES.boundShop
        : TELEGRAM_REPLIES.boundCustomer,
    );
  }

  /**
   * Answer in the chat. A failed reply is logged and swallowed: the binding is
   * already committed, and retrying the update would only answer "invalid".
   */
  private async reply(chatId: string, text: string): Promise<void> {
    try {
      await this.client.sendMessage(chatId, text);
    } catch (err) {
      this.logger.warn(
        { event: 'telegram.updates.replyFailed', chatId, err: describe(err) },
        'Telegram reply to /start failed',
      );
    }
  }
}

/** The error's message only — TelegramClient errors are token-free by construction. */
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
