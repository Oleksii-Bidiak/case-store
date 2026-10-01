import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationOutbox } from '@prisma/client';
import {
  PermanentDeliveryError,
  type ChannelHealth,
  type NotificationChannelAdapter,
} from '../../notification-outbox/channels/notification-channel-adapter';
import { TelegramApiError, TelegramClient } from './telegram.client';
import { TelegramChannelState } from './telegram-channel.state';
import { TelegramRendererRegistry } from './telegram-renderers';

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
 * Failure mapping onto the outbox contract:
 * - 400 / 403 (chat not found, bot blocked by this recipient) →
 *   {@link PermanentDeliveryError}: the row is FAILED at once, retrying only
 *   burns attempts;
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
  ) {}

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
        throw new PermanentDeliveryError(err.message);
      }
      throw err;
    }
  }
}
