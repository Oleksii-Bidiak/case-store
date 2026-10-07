import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationAudience, NotificationChannel, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import {
  NotificationBindingRepository,
  type CustomerBindingOwner,
  type RecipientScope,
} from './notification-binding.repository';
import type {
  ConsumeTokenResult,
  NotificationBindingEntity,
} from './entities/notification-binding.entity';
import { CustomerNotifier } from './customer-notifier.service';

/** How long a deep link stays usable. Long enough to find the phone, short enough to leak little. */
export const BINDING_TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * Shape of a token we could have issued: 32 random bytes in base64url are 43
 * characters of `A-Za-z0-9_-` — inside Telegram's 64-character `start` limit
 * and its allowed alphabet. Anything else is refused before the database is asked.
 */
export const BINDING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

export interface IssueTokenParams {
  channel: NotificationChannel;
  audience: NotificationAudience;
  /** SHOP: who is connecting (audit). CUSTOMER: whose notifications the chat gets. */
  userId?: string | null;
  /** CUSTOMER guest: the order the chat is being connected from. */
  orderId?: string | null;
}

export interface IssuedToken {
  /** The raw token — goes into the deep link, never into the database or a log. */
  token: string;
  expiresAt: Date;
}

/** The chat a `/start` came from, as the channel reports it. */
export interface StartingChat {
  id: string | number;
  label?: string | null;
  /**
   * A one-to-one chat with the bot, as the channel reports it. Required, so a
   * caller cannot forget it: a CUSTOMER token from a non-private chat is refused
   * and spent (`private-only`).
   */
  isPrivate: boolean;
}

/** SHA-256 hex — the only form in which a token is stored or logged (prefix only). */
export function hashBindingToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * NotificationBindingService — which chats receive notifications, and the
 * one-time tokens that connect them (TASK-675, plan 187).
 *
 * Channel-agnostic: the Telegram-specific halves (the `getUpdates` poller, the
 * deep link, the test message) live in `telegram/` and call in here.
 *
 * The flow: {@link issueToken} → the deep link `https://t.me/<bot>?start=<token>`
 * → the person presses «Старт» → the poller sees `/start <token>` and calls
 * {@link consumeToken} with the chat it came from. The chat, not the person who
 * asked for the link, becomes the recipient — so a group can be connected, and
 * an id typed by hand never can.
 */
@Injectable()
export class NotificationBindingService {
  constructor(
    private readonly repository: NotificationBindingRepository,
    // TASK-680: a guest's freshly connected chat gets the order summary, queued
    // inside the token exchange (owner decision 3, 2026-10-07).
    private readonly customerNotifier: CustomerNotifier,
  ) {}

  async issueToken(params: IssueTokenParams): Promise<IssuedToken> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + BINDING_TOKEN_TTL_MS);
    await this.repository.createToken({
      tokenHash: hashBindingToken(token),
      channel: params.channel,
      audience: params.audience,
      userId: params.userId ?? null,
      orderId: params.orderId ?? null,
      expiresAt,
    });
    return { token, expiresAt };
  }

  /**
   * Exchange `token` for a binding of `chat`. One-time and atomic — see
   * {@link NotificationBindingRepository.consumeToken}. A chat that is already
   * bound for the token's audience keeps its existing row (`created: false`).
   *
   * A CUSTOMER binding this exchange CREATES for a guest order also queues that
   * order's summary for the chat, in the same transaction (TASK-680, see
   * {@link CustomerNotifier.onBindingCreated}): the binding and its first
   * message commit together, and a re-press that creates nothing sends nothing.
   */
  consumeToken(token: string, chat: StartingChat): Promise<ConsumeTokenResult> {
    if (!BINDING_TOKEN_PATTERN.test(token)) {
      return Promise.resolve({ ok: false, reason: 'invalid' });
    }
    const label = chat.label?.trim() ? chat.label.trim() : null;
    return this.repository.consumeToken(
      hashBindingToken(token),
      { externalId: String(chat.id), label, isPrivate: chat.isPrivate },
      new Date(Date.now()),
      (binding, tx) => this.customerNotifier.onBindingCreated(binding, tx),
    );
  }

  /** Who receives a notification of this audience on this channel. `tx`-aware (TASK-677). */
  findActiveRecipients(
    channel: NotificationChannel,
    audience: NotificationAudience,
    tx?: Prisma.TransactionClient,
  ): Promise<NotificationBindingEntity[]> {
    return this.repository.findActive(channel, audience, tx);
  }

  /** Active bindings with who connected them — for the admin screen. */
  listActive(
    channel: NotificationChannel,
    audience: NotificationAudience,
  ): Promise<NotificationBindingEntity[]> {
    return this.repository.listActiveWithUser(channel, audience);
  }

  /**
   * Is this chat still an active recipient on this channel for this scope (an
   * active SHOP binding, or an active CUSTOMER binding of the given owner)? The
   * send gate: a chat bound for one audience never satisfies the other.
   */
  hasActiveRecipient(
    channel: NotificationChannel,
    externalId: string,
    scope: RecipientScope,
  ): Promise<boolean> {
    return this.repository.hasActive(channel, externalId, scope);
  }

  /**
   * Disconnect one binding. 404 when it does not exist, is already revoked, or
   * belongs to another channel/audience — all three mean "nothing here to
   * disconnect" to the caller.
   */
  async revoke(
    id: string,
    scope: { channel: NotificationChannel; audience: NotificationAudience },
  ): Promise<void> {
    const revoked = await this.repository.revoke(id, scope, new Date(Date.now()));
    if (!revoked) {
      throw new NotFoundException('Підключений чат не знайдено');
    }
  }

  /**
   * The channel said this chat is gone (bot blocked, kicked, chat not found):
   * stop every binding of it, so no further row is ever queued for a dead chat.
   */
  revokeByExternalId(channel: NotificationChannel, externalId: string): Promise<number> {
    return this.repository.revokeByExternalId(channel, externalId, new Date(Date.now()));
  }

  /**
   * Active customer chats of an account and/or a guest order, one per chat,
   * oldest first (TASK-679). With one owner it answers «is this account / order
   * connected?»; with both, «who hears about this order?» (TASK-680). `tx`-aware.
   */
  findActiveForCustomer(
    owner: CustomerBindingOwner,
    tx?: Prisma.TransactionClient,
    channel: NotificationChannel = NotificationChannel.TELEGRAM,
  ): Promise<NotificationBindingEntity[]> {
    return this.repository.findActiveForCustomer(channel, owner, tx);
  }

  /** The owner's most recently connected active customer row, or null (TASK-679). */
  findLatestActiveForCustomer(
    owner: CustomerBindingOwner,
    channel: NotificationChannel = NotificationChannel.TELEGRAM,
  ): Promise<NotificationBindingEntity | null> {
    return this.repository.findLatestActiveForCustomer(channel, owner);
  }

  /**
   * Disconnect the customer chats of exactly ONE owner the caller has proved —
   * an account or a guest order, not both (a mixed owner would let one proof
   * reach the other's chats). Idempotent: nothing connected is not an error, the
   * end state is the same. Returns how many chats were disconnected.
   */
  revokeForCustomer(
    owner: { userId: string; orderId?: never } | { orderId: string; userId?: never },
    channel: NotificationChannel = NotificationChannel.TELEGRAM,
  ): Promise<number> {
    return this.repository.revokeForCustomer(channel, owner, new Date(Date.now()));
  }

  getOffset(channel: NotificationChannel): Promise<number> {
    return this.repository.getOffset(channel);
  }

  saveOffset(channel: NotificationChannel, offset: number): Promise<void> {
    return this.repository.saveOffset(channel, offset);
  }
}
