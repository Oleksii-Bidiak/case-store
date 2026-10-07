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

/**
 * Whose customer notifications are meant (TASK-679): an account, a guest order,
 * or — for the recipients of one order's event — both at once. An owner with
 * neither matches nothing.
 */
export interface CustomerBindingOwner {
  userId?: string | null;
  orderId?: string | null;
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
 * ## Never select a binding through its unique indexes
 *
 * The three `@@unique` of the model (one active SHOP row per chat; one active
 * CUSTOMER row per chat and account, and per chat and guest order — TASK-1091)
 * are PARTIAL indexes, so Prisma offers them as `WhereUniqueInput`s that are
 * unique only on the active side. Every read here is `findFirst`/`findMany` with
 * an explicit `revokedAt: null`, and every write is by `id` or `updateMany` —
 * the `User.isOwner` lesson (TASK-634).
 *
 * ## A customer only ever reaches their own rows
 *
 * The customer reads and the customer revoke take an {@link CustomerBindingOwner}
 * — an account id or a guest order id that the CALLER proved (a session, a guest
 * access token) — and always filter on `audience = CUSTOMER` plus that owner.
 * There is no by-id customer path: an id typed into a request can never reach
 * somebody else's chat or a shop chat.
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

      // The row the insert either created or collided with. A CUSTOMER chat may
      // hold several active rows — one per account and one per guest order
      // (TASK-1091) — so the owner of THIS token is part of the key; without it
      // a chat connected to order A and then to order B would read back A's row.
      const binding = await tx.notificationBinding.findFirst({
        where: {
          channel: token.channel,
          audience: token.audience,
          externalId: chat.externalId,
          revokedAt: null,
          ...(token.audience === NotificationAudience.CUSTOMER
            ? { userId: token.userId, orderId: token.orderId }
            : {}),
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

  /**
   * Active CUSTOMER chats of an owner, oldest first (TASK-679). With both an
   * account and an order (the recipients of one order's event, TASK-680) it is
   * the union — de-duplicated by chat, because a chat connected to the account
   * AND to the order must still get one message, not two. `tx`-aware so an event
   * can pick its recipients inside its own transaction (plan 187 constraint #2).
   */
  async findActiveForCustomer(
    channel: NotificationChannel,
    owner: CustomerBindingOwner,
    tx?: Prisma.TransactionClient,
  ): Promise<NotificationBindingEntity[]> {
    const or = ownerFilter(owner);
    if (or.length === 0) return [];
    const client = tx ?? this.prisma;
    const rows = await client.notificationBinding.findMany({
      where: { channel, audience: NotificationAudience.CUSTOMER, revokedAt: null, OR: or },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const seen = new Set<string>();
    const unique: NotificationBindingEntity[] = [];
    for (const row of rows) {
      if (seen.has(row.externalId)) continue;
      seen.add(row.externalId);
      unique.push(toEntity(row));
    }
    return unique;
  }

  /**
   * Disconnect every active CUSTOMER chat of an owner (TASK-679). Scoped by
   * construction: `audience = CUSTOMER` and the owner the caller proved — never
   * a SHOP chat, never another customer's. Returns how many rows were revoked.
   */
  async revokeForCustomer(
    channel: NotificationChannel,
    owner: CustomerBindingOwner,
    now: Date,
  ): Promise<number> {
    const or = ownerFilter(owner);
    if (or.length === 0) return 0;
    const { count } = await this.prisma.notificationBinding.updateMany({
      where: { channel, audience: NotificationAudience.CUSTOMER, revokedAt: null, OR: or },
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

/**
 * The owner as `OR` arms. An absent or empty id contributes nothing — never a
 * `{ userId: null }` arm, which would match every orphaned row.
 */
function ownerFilter(owner: CustomerBindingOwner): Prisma.NotificationBindingWhereInput[] {
  const or: Prisma.NotificationBindingWhereInput[] = [];
  if (owner.userId) or.push({ userId: owner.userId });
  if (owner.orderId) or.push({ orderId: owner.orderId });
  return or;
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
