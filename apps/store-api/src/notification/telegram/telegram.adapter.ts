import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationOutbox } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
// eslint-disable-next-line local/no-deep-module-import -- cycle: notification-outbox barrel > notification-outbox.module > notification.module > this file
import {
  PermanentDeliveryError,
  type ChannelHealth,
  type NotificationChannelAdapter,
} from '../../notification-outbox/channels/notification-channel-adapter';
import { TelegramApiError, TelegramClient } from './telegram.client';
import { TelegramChannelState } from './telegram-channel.state';
import { TelegramRendererRegistry } from './telegram-renderers';
import { NotificationBindingService } from '../notification-binding.service';
import { isTelegramChatGone, revokeGoneTelegramChat } from './telegram-chat-gone';

/** Telegram codes that mean the BOT is gone, not that this one recipient is unreachable. */
const TOKEN_REJECTED_CODES = new Set([401, 404]);

/**
 * TelegramAdapter — the TELEGRAM channel of the notification outbox (TASK-674).
 *
 * Renders the pair `(row.type, TELEGRAM)` through {@link TelegramRendererRegistry}
 * and sends it to `row.recipientAddress`, which for this channel is a `chat_id`.
 * Until TASK-677 nothing enqueues a TELEGRAM row, so registering the adapter
 * changes no behaviour for anyone.
 *
 * A row is only ever sent to a chat that is still BOUND (TASK-675): the binding
 * is checked before Telegram is contacted, so a chat disconnected in the admin
 * after the row was queued is FAILED with `binding revoked` instead of receiving
 * one last message.
 *
 * Failure mapping onto the outbox contract:
 * - 403, or 400 "chat not found" (bot blocked or kicked, chat deleted) → every
 *   binding of that chat is revoked (TASK-675; `telegram.binding.revoked` at
 *   error level) and {@link PermanentDeliveryError}: the row is FAILED at once,
 *   and no later event queues another row for a dead chat;
 * - any other 400 (message too long, malformed request) →
 *   {@link PermanentDeliveryError} only — the message was wrong, the chat is fine;
 * - 401 / 404 (the TOKEN was rejected) → the CHANNEL is marked failed and the
 *   row is retried as transient. The row did nothing wrong: once the token is
 *   fixed it should still be delivered, and marking the channel failed makes
 *   {@link isEnabled} false so the dispatcher stops spending rows meanwhile;
 * - everything else (network, timeout, 429, 5xx, unknown `type`) → a plain
 *   `Error`, rescheduled with backoff.
 */
@Injectable()
export class TelegramAdapter implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.TELEGRAM;

  constructor(
    private readonly client: TelegramClient,
    private readonly state: TelegramChannelState,
    private readonly renderers: TelegramRendererRegistry,
    private readonly bindings: NotificationBindingService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TelegramAdapter.name);
  }

  /**
   * True only while the last `getMe` succeeded. Called by the dispatcher for
   * every due TELEGRAM row, so it must stay synchronous and free; a `failed`
   * state is re-checked in the background, at most once per five minutes
   * ({@link TelegramChannelState.ensureFresh} is rate-limited and deduplicated).
   */
  isEnabled(): boolean {
    if (this.state.isOk()) return true;
    void this.state.ensureFresh();
    return false;
  }

  /**
   * True whenever a token is set — including while `getMe` has not answered yet
   * or has failed. Such rows must wait, not be drained (see the interface).
   */
  isConfigured(): boolean {
    return this.state.snapshot().state !== 'unconfigured';
  }

  /** Maps the channel state onto the outbox's health vocabulary. Sends nothing. */
  async healthcheck(): Promise<ChannelHealth> {
    const snapshot = await this.state.ensureFresh();
    switch (snapshot.state) {
      case 'ok':
        return { state: 'ok', detail: `@${snapshot.botUsername}` };
      case 'failed':
        return { state: 'failed', detail: snapshot.reason };
      case 'unconfigured':
        return { state: 'disabled', detail: 'TELEGRAM_BOT_TOKEN is not set' };
    }
  }

  async send(row: NotificationOutbox): Promise<void> {
    if (!(await this.bindings.hasActiveRecipient(this.channel, row.recipientAddress))) {
      throw new PermanentDeliveryError('binding revoked');
    }
    // Throws a plain Error for an unknown type — transient, by design.
    const text = this.renderers.render(row);
    try {
      await this.client.sendMessage(row.recipientAddress, text, {
        parseMode: 'HTML',
        disableWebPagePreview: true,
      });
    } catch (err) {
      if (err instanceof TelegramApiError && err.kind === 'permanent') {
        if (err.errorCode !== undefined && TOKEN_REJECTED_CODES.has(err.errorCode)) {
          this.state.markFailed(err.message);
          throw new Error(err.message);
        }
        if (isTelegramChatGone(err)) {
          await revokeGoneTelegramChat(this.bindings, this.logger, row.recipientAddress, err);
        }
        throw new PermanentDeliveryError(err.message);
      }
      throw err;
    }
  }
}
