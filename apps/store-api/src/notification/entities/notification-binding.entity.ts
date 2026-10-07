import type { NotificationAudience, NotificationChannel } from '@prisma/client';

/** The account that connected a chat, as the admin screen names it (TASK-675). */
export interface NotificationBindingUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/**
 * A chat that receives notifications (TASK-675) — the domain view of a
 * `notification_bindings` row. `revokedAt === null` means active.
 */
export interface NotificationBindingEntity {
  id: string;
  channel: NotificationChannel;
  audience: NotificationAudience;
  /** The chat in its channel's id space — a Telegram `chat_id` as a string. */
  externalId: string;
  label: string | null;
  userId: string | null;
  orderId: string | null;
  createdAt: Date;
  revokedAt: Date | null;
  /** Present only on reads that ask for it (the admin list). */
  connectedBy?: NotificationBindingUser | null;
}

/**
 * Why a token exchange was refused. `invalid` and `expired` answer the chat the
 * same way. `private-only` means a CUSTOMER token was sent from a group: the
 * token is spent (every member saw it) and the chat is told to get a new link
 * and open it in a private chat with the bot.
 */
export type ConsumeTokenFailure = 'invalid' | 'expired' | 'private-only';

/** Outcome of exchanging a `/start` token for a binding. */
export type ConsumeTokenResult =
  | {
      ok: true;
      binding: NotificationBindingEntity;
      /** False when the chat was already bound for this audience — the existing row is kept. */
      created: boolean;
    }
  | { ok: false; reason: ConsumeTokenFailure };
