import { ConflictException, Injectable } from '@nestjs/common';
import { NotificationAudience, NotificationChannel } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { NotificationBindingService } from '../notification-binding.service';
import type { NotificationBindingEntity } from '../entities/notification-binding.entity';
import { TelegramApiError, TelegramClient } from './telegram.client';
import { TelegramChannelState, type TelegramChannelSnapshot } from './telegram-channel.state';
import { isTelegramChatGone, revokeGoneTelegramChat } from './telegram-chat-gone';

/** The test message. Plain text: the operator should see exactly this in the chat. */
export const TELEGRAM_TEST_MESSAGE = '🔔 Тестове повідомлення магазину';

const SHOP = { channel: NotificationChannel.TELEGRAM, audience: NotificationAudience.SHOP };

export interface TelegramShopStatus {
  snapshot: TelegramChannelSnapshot;
  bindings: NotificationBindingEntity[];
}

export interface TelegramShopLink {
  /** Opens a private chat with the bot; «Старт» there connects that chat. */
  deepLink: string;
  /** Asks which group to add the bot to; the group is connected instead. */
  groupDeepLink: string;
  expiresAt: Date;
}

export interface TelegramTestResult {
  bindingId: string;
  ok: boolean;
  error?: string;
  /** True when Telegram said the chat is gone and its binding was revoked. */
  revoked?: boolean;
}

/**
 * The admin «Сповіщення» screen's Telegram half (TASK-675; the screen is
 * TASK-676): the channel state with the shop's connected chats, a fresh connect
 * link, the test message and «Відключити».
 *
 * Every operation that would talk to Telegram first asks the channel state and
 * answers 409 when it is not `ok`, rather than issuing a link to a bot that
 * cannot answer or reporting a test as failed for reasons that are not the chat's.
 */
@Injectable()
export class TelegramAdminService {
  constructor(
    private readonly client: TelegramClient,
    private readonly state: TelegramChannelState,
    private readonly bindings: NotificationBindingService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TelegramAdminService.name);
  }

  async status(): Promise<TelegramShopStatus> {
    const [snapshot, bindings] = await Promise.all([
      this.state.ensureFresh(),
      this.bindings.listActive(SHOP.channel, SHOP.audience),
    ]);
    return { snapshot, bindings };
  }

  /** A one-time link that connects whichever chat presses «Старт» to shop pings. */
  async createShopLink(userId: string): Promise<TelegramShopLink> {
    const botUsername = await this.requireOkBot();
    const { token, expiresAt } = await this.bindings.issueToken({ ...SHOP, userId });
    const bot = encodeURIComponent(botUsername);
    return {
      deepLink: `https://t.me/${bot}?start=${token}`,
      groupDeepLink: `https://t.me/${bot}?startgroup=${token}`,
      expiresAt,
    };
  }

  /**
   * Send the test message to every active shop chat, directly — not through the
   * outbox. This is not a business event that must survive a crash; it is an
   * operator asking "does it work right now?", and only a synchronous send
   * answers that honestly. A chat Telegram reports as gone is revoked, exactly as
   * the outbox adapter would do.
   */
  async sendTest(): Promise<TelegramTestResult[]> {
    await this.requireOkBot();
    const targets = await this.bindings.findActiveRecipients(SHOP.channel, SHOP.audience);
    if (targets.length === 0) {
      throw new ConflictException('Немає жодного підключеного чату — спершу підключіть Telegram');
    }

    const results: TelegramTestResult[] = [];
    for (const binding of targets) {
      results.push(await this.sendOne(binding));
    }
    return results;
  }

  /** «Відключити» one shop chat. 404 when it is not an active shop binding. */
  revokeShopBinding(id: string): Promise<void> {
    return this.bindings.revoke(id, SHOP);
  }

  private async sendOne(binding: NotificationBindingEntity): Promise<TelegramTestResult> {
    try {
      await this.client.sendMessage(binding.externalId, TELEGRAM_TEST_MESSAGE);
      return { bindingId: binding.id, ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'unknown error';
      if (isTelegramChatGone(err)) {
        const revoked = await revokeGoneTelegramChat(
          this.bindings,
          this.logger,
          binding.externalId,
          err,
        );
        return { bindingId: binding.id, ok: false, error, revoked };
      }
      if (err instanceof TelegramApiError && (err.errorCode === 401 || err.errorCode === 404)) {
        this.state.markFailed(err.message);
      }
      return { bindingId: binding.id, ok: false, error };
    }
  }

  private async requireOkBot(): Promise<string> {
    const snapshot = await this.state.ensureFresh();
    if (snapshot.state !== 'ok') {
      throw new ConflictException(
        snapshot.state === 'unconfigured'
          ? 'Telegram-бот не налаштований: на сервері не задано TELEGRAM_BOT_TOKEN'
          : `Telegram-бот зараз не відповідає: ${snapshot.reason}`,
      );
    }
    return snapshot.botUsername;
  }
}
