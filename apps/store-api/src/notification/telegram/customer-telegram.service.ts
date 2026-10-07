import { ConflictException, Injectable } from '@nestjs/common';
import { NotificationAudience, NotificationChannel } from '@prisma/client';
import { NotificationBindingService } from '../notification-binding.service';
import { TelegramChannelState } from './telegram-channel.state';

/**
 * The owner a customer route acts for — proved by the caller: an account by its
 * session, a guest order by its access token. Exactly one of the two.
 */
export type CustomerTelegramOwner = { userId: string } | { orderId: string };

/** «Can I get Telegram notifications, and am I getting them?» */
export interface CustomerTelegramStatus {
  /**
   * The bot can be connected right now. False when the shop has not set the bot
   * up or it is not answering — the page must SAY so (plan 187 constraint #1),
   * never offer a link that leads nowhere.
   */
  available: boolean;
  /** At least one chat receives this owner's notifications. */
  connected: boolean;
  /** The most recently connected chat's name as it was when connected. */
  label?: string;
  /** When that chat was connected. */
  createdAt?: Date;
  /** The bot's @username (no @), when `available`. */
  botUsername?: string;
}

export interface CustomerTelegramLink {
  /** Opens a private chat with the bot; «Старт» there connects it. */
  deepLink: string;
  expiresAt: Date;
}

const TELEGRAM = NotificationChannel.TELEGRAM;

/**
 * The customer side of Telegram notifications (TASK-679): the profile («Куди
 * надсилати сповіщення») for an account, the order-success page for a guest.
 *
 * Mirrors {@link TelegramAdminService.createShopLink}, with three differences:
 * the token is CUSTOMER and carries the owner (`userId` or `orderId`), there is
 * no group link (a customer's order updates belong in their private chat), and
 * the status never carries the bot's failure reason — that is the operator's
 * business; the customer is told only that the option is unavailable.
 */
@Injectable()
export class CustomerTelegramService {
  constructor(
    private readonly state: TelegramChannelState,
    private readonly bindings: NotificationBindingService,
  ) {}

  async status(owner: CustomerTelegramOwner): Promise<CustomerTelegramStatus> {
    const [snapshot, latest] = await Promise.all([
      this.state.ensureFresh(),
      this.bindings.findLatestActiveForCustomer(owner),
    ]);
    return {
      available: snapshot.state === 'ok',
      connected: latest !== null,
      ...(latest?.label ? { label: latest.label } : {}),
      ...(latest ? { createdAt: latest.createdAt } : {}),
      ...(snapshot.state === 'ok' ? { botUsername: snapshot.botUsername } : {}),
    };
  }

  /**
   * A one-time deep link that connects whichever private chat presses «Старт» to
   * this owner's notifications. Issued on click: the 15-minute TTL starts now.
   *
   * @throws ConflictException (409) when the bot is not usable.
   */
  async createLink(owner: CustomerTelegramOwner): Promise<CustomerTelegramLink> {
    const snapshot = await this.state.ensureFresh();
    if (snapshot.state !== 'ok') {
      throw new ConflictException('Сповіщення в Telegram зараз недоступні');
    }
    const { token, expiresAt } = await this.bindings.issueToken({
      channel: TELEGRAM,
      audience: NotificationAudience.CUSTOMER,
      ...owner,
    });
    return {
      deepLink: `https://t.me/${encodeURIComponent(snapshot.botUsername)}?start=${token}`,
      expiresAt,
    };
  }

  /** Disconnect every chat of this owner. Idempotent; returns how many were connected. */
  revoke(owner: CustomerTelegramOwner): Promise<number> {
    return this.bindings.revokeForCustomer(owner, TELEGRAM);
  }
}
