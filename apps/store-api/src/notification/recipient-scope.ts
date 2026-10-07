import { NotificationAudience, type NotificationOutbox, type Prisma } from '@prisma/client';
import type { RecipientScope } from './notification-binding.repository';
import { SHOP_NOTIFICATION_TYPES } from './shop-notification.types';

/**
 * The owner a CUSTOMER messenger row was queued for: the order's account and
 * the order itself, as they were at enqueue time. Every CUSTOMER row on a
 * binding-based channel (Telegram, TASK-680) MUST carry it in its payload under
 * this key. Without it the send gate cannot tell whether the chat still follows
 * THIS owner, so it refuses the row.
 *
 * A type alias, not an interface, so it spreads into a Prisma JSON payload.
 */
export type RecipientOwnerPayload = {
  recipientOwner: { userId: string | null; orderId: string | null };
};

/**
 * Which binding must still be active for this outbox row to be delivered.
 *
 * - A shop type ({@link SHOP_NOTIFICATION_TYPES}) needs an active SHOP binding
 *   of the chat.
 * - Anything else is a customer row and needs an active CUSTOMER binding of the
 *   chat for the owner in `payload.recipientOwner`.
 *
 * Returns null when a customer row names no owner. The caller refuses such a row
 * permanently: a message whose recipient cannot be proved still wanted is never
 * sent.
 *
 * Why the type, and not "any active binding of the chat": since TASK-679 one
 * chat can be a SHOP chat and a customer's chat at the same time. With an
 * audience-blind gate, disconnecting the SHOP binding left every queued shop
 * ping (customer names, phones, e-mails) flowing to the chat, because the
 * CUSTOMER row kept it "active".
 */
export function recipientScopeOf(
  row: Pick<NotificationOutbox, 'type' | 'payload'>,
): RecipientScope | null {
  if (SHOP_NOTIFICATION_TYPES.has(row.type)) {
    return { audience: NotificationAudience.SHOP };
  }
  const owner = readOwner(row.payload);
  if (owner === null) return null;
  return { audience: NotificationAudience.CUSTOMER, owner };
}

function readOwner(
  payload: Prisma.JsonValue,
): { userId: string | null; orderId: string | null } | null {
  if (!isObject(payload)) return null;
  const raw = payload.recipientOwner;
  if (!isObject(raw)) return null;
  const userId = nonEmpty(raw.userId);
  const orderId = nonEmpty(raw.orderId);
  if (userId === null && orderId === null) return null;
  return { userId, orderId };
}

function isObject(value: Prisma.JsonValue | undefined): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: Prisma.JsonValue | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
