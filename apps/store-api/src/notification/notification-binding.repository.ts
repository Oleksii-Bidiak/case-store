import { Injectable } from '@nestjs/common';
import {
  NotificationAudience,
  NotificationBinding,
  NotificationChannel,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma';
import type {
  ConsumeTokenResult,
  NotificationBindingEntity,
  NotificationBindingUser,
} from './entities/notification-binding.entity';

/** What the repository needs to store a freshly issued token. */
export interface CreateBindingTokenParams {
  tokenHash: string;
  channel: NotificationChannel;
  audience: NotificationAudience;
  userId?: string | null;
  orderId?: string | null;
  expiresAt: Date;
}

/** The chat that sent `/start <token>`. */
export interface BindingChat {
  externalId: string;
  label?: string | null;
}

const CONNECTED_BY_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const satisfies Prisma.UserSelect;

/**
 * NotificationBindingRepository — every query on `notification_bindings`,
 * `notification_binding_tokens` and `notification_channel_state` (TASK-675).
 *
 * ## Never select a binding through its unique index
 *
 * `@@unique([channel, audience, externalId], where: revokedAt IS NULL)` is a
 * PARTIAL index, so Prisma offers it as a `WhereUniqueInput` that is unique only
 * on the active side. Every read here is `findFirst`/`findMany` with an explicit
 * `revokedAt: null`, and every write is by `id` or `updateMany` — the
 * `User.isOwner` lesson (TASK-634).
 */
@Injectable()
export class NotificationBindingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createToken(params: CreateBindingTokenParams): Promise<void> {
    await this.prisma.notificationBindingToken.create({
      data: {
        tokenHash: params.tokenHash,
        channel: params.channel,
        audience: params.audience,
        userId: params.userId ?? null,
        orderId: params.orderId ?? null,
        expiresAt: params.expiresAt,
      },
    });
  }

  /**
   * Exchange a token for a binding, in ONE transaction.
   *
   * The conditional `updateMany` is the whole one-time guarantee: under READ
   * COMMITTED a second, concurrent exchange of the same token blocks on the row
   * lock, re-evaluates `consumedAt IS NULL` after the first commits, matches
   * nothing and is refused. The binding insert is `ON CONFLICT DO NOTHING`
   * (`skipDuplicates`) against the partial unique index, so two DIFFERENT tokens
   * racing for the same chat still leave one active row — and, unlike catching
   * P2002, it does not abort the surrounding transaction.
   */
  consumeToken(tokenHash: string, chat: BindingChat, now: Date): Promise<ConsumeTokenResult> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.notificationBindingToken.updateMany({
        where: { tokenHash, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });

      const token = await tx.notificationBindingToken.findUnique({ where: { tokenHash } });
      if (count !== 1 || token === null) {
        const expired = token !== null && token.consumedAt === null && token.expiresAt <= now;
        return { ok: false, reason: expired ? 'expired' : 'invalid' } as const;
      }

      // A CUSTOMER token whose account and order were both deleted since it was
      // issued would bind a chat to nobody. It is spent either way.
      if (
        token.audience === NotificationAudience.CUSTOMER &&
        token.userId === null &&
        token.orderId === null
      ) {
        return { ok: false, reason: 'invalid' } as const;
      }

      const { count: created } = await tx.notificationBinding.createMany({
        data: [
          {
            channel: token.channel,
            audience: token.audience,
            externalId: chat.externalId,
            label: chat.label ?? null,
            userId: token.userId,
            orderId: token.orderId,
          },
        ],
        skipDuplicates: true,
      });

      const binding = await tx.notificationBinding.findFirst({
        where: {
          channel: token.channel,
          audience: token.audience,
          externalId: chat.externalId,
          revokedAt: null,
        },
      });
      if (binding === null) {
        // Unreachable: the insert either created this row or collided with it.
        throw new Error('Notification binding vanished inside its own transaction');
      }

      return { ok: true, binding: toEntity(binding), created: created === 1 } as const;
    });
  }

  /** Active bindings of one channel and audience. `tx`-aware for TASK-677's enqueue. */
  async findActive(
    channel: NotificationChannel,
    audience: NotificationAudience,
    tx?: Prisma.TransactionClient,
  ): Promise<NotificationBindingEntity[]> {
    const client = tx ?? this.prisma;
    const rows = await client.notificationBinding.findMany({
      where: { channel, audience, revokedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toEntity);
  }

  /** Active bindings with the account that connected each one — the admin list. */
  async listActiveWithUser(
    channel: NotificationChannel,
    audience: NotificationAudience,
  ): Promise<NotificationBindingEntity[]> {
    const rows = await this.prisma.notificationBinding.findMany({
      where: { channel, audience, revokedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: CONNECTED_BY_SELECT } },
    });
    return rows.map((row) => ({
      ...toEntity(row),
      connectedBy: row.user as NotificationBindingUser | null,
    }));
  }

  /** Is this chat still an active recipient of this channel, for any audience? */
  async hasActive(channel: NotificationChannel, externalId: string): Promise<boolean> {
    const row = await this.prisma.notificationBinding.findFirst({
      where: { channel, externalId, revokedAt: null },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Revoke one active binding, but only inside the given channel and audience —
   * the shop's «Відключити» must not reach a customer's chat by id. False when
   * there is no such active row.
   */
  async revoke(
    id: string,
    scope: { channel: NotificationChannel; audience: NotificationAudience },
    now: Date,
  ): Promise<boolean> {
    const { count } = await this.prisma.notificationBinding.updateMany({
      where: { id, channel: scope.channel, audience: scope.audience, revokedAt: null },
      data: { revokedAt: now },
    });
    return count === 1;
  }

  /** Revoke every active binding of a chat, whatever its audience. Returns how many. */
  async revokeByExternalId(
    channel: NotificationChannel,
    externalId: string,
    now: Date,
  ): Promise<number> {
    const { count } = await this.prisma.notificationBinding.updateMany({
      where: { channel, externalId, revokedAt: null },
      data: { revokedAt: now },
    });
    return count;
  }

  /** The stored poller offset; 0 when the channel has never been polled. */
  async getOffset(channel: NotificationChannel): Promise<number> {
    const row = await this.prisma.notificationChannelState.findUnique({ where: { channel } });
    // Telegram update ids stay far below 2^53, so the conversion is exact.
    return row ? Number(row.updateOffset) : 0;
  }

  async saveOffset(channel: NotificationChannel, offset: number): Promise<void> {
    const updateOffset = BigInt(offset);
    await this.prisma.notificationChannelState.upsert({
      where: { channel },
      create: { channel, updateOffset },
      update: { updateOffset },
    });
  }
}

function toEntity(row: NotificationBinding): NotificationBindingEntity {
  return {
    id: row.id,
    channel: row.channel,
    audience: row.audience,
    externalId: row.externalId,
    label: row.label,
    userId: row.userId,
    orderId: row.orderId,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  };
}
