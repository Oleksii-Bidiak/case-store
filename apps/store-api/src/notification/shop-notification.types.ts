/**
 * The shop's own notifications (TASK-677, plan 187): what the owner's Telegram
 * chats are told when a CUSTOMER does something the shop must react to.
 *
 * Three events, and only events a customer triggers — owner decision of
 * 2026-10-01: an order taken by phone in the admin or a return an operator
 * opened has a member of staff as its trigger, who does not need telling.
 *
 * The payloads are small on purpose: ids plus the few display fields the
 * message needs, captured at event time. The admin link is built at RENDER time
 * from `STORE_ADMIN_URL`, so a row queued before the origin was configured still
 * gets a working link once it is.
 */

/** `NotificationOutbox.type` — a customer placed an order on the storefront. */
export const SHOP_NEW_ORDER_TYPE = 'shop-new-order';

/** `NotificationOutbox.type` — the storefront contact form was submitted (not spam). */
export const SHOP_CONTACT_MESSAGE_TYPE = 'shop-contact-message';

/** `NotificationOutbox.type` — a customer requested a return from their account. */
export const SHOP_RETURN_REQUESTED_TYPE = 'shop-return-requested';

export type ShopNotificationType =
  typeof SHOP_NEW_ORDER_TYPE | typeof SHOP_CONTACT_MESSAGE_TYPE | typeof SHOP_RETURN_REQUESTED_TYPE;

/**
 * Every shop type. The Telegram send gate reads it to decide that a row is for
 * a SHOP chat, so a new shop type that is missing here would be gated as a
 * customer row and refused. Fail-closed, and the adapter spec pins the list.
 */
export const SHOP_NOTIFICATION_TYPES: ReadonlySet<string> = new Set<ShopNotificationType>([
  SHOP_NEW_ORDER_TYPE,
  SHOP_CONTACT_MESSAGE_TYPE,
  SHOP_RETURN_REQUESTED_TYPE,
]);

/** How much of a free-text field (message, return reason) travels in the payload. */
export const SHOP_EXCERPT_MAX_LENGTH = 300;

/*
 * The payloads are `type` aliases, not interfaces, on purpose: only an object
 * type alias is assignable to Prisma's JSON input (an interface has no implicit
 * index signature).
 */

/** Payload of a {@link SHOP_NEW_ORDER_TYPE} row. */
export type ShopNewOrderPayload = {
  orderId: string;
  /** `Order.total` as stored — a 2-dp decimal string, UAH. */
  total: string;
  /** `PaymentMethod` value; null only on a row read without it. */
  paymentMethod: string | null;
  /** `DeliveryMethod` value; null only on a row read without it. */
  deliveryMethod: string | null;
  /** Units across all lines. */
  itemsCount: number;
  /** The guest's name, or the account's. Null when the account has none. */
  customerName: string | null;
  city: string | null;
};

/** What the contact form gives the notifier; the message is cut to an excerpt there. */
export interface ShopContactMessageInput {
  messageId: string;
  name: string;
  phone: string;
  email?: string | null;
  topic?: string | null;
  orderRef?: string | null;
  message: string;
}

/** Payload of a {@link SHOP_CONTACT_MESSAGE_TYPE} row. */
export type ShopContactMessagePayload = {
  messageId: string;
  name: string;
  phone: string;
  email: string | null;
  topic: string | null;
  orderRef: string | null;
  /** The message, cut to {@link SHOP_EXCERPT_MAX_LENGTH}. */
  excerpt: string;
};

/** What a customer return gives the notifier; the reason is cut to an excerpt there. */
export interface ShopReturnRequestedInput {
  returnId: string;
  orderId: string;
  itemsCount: number;
  reason?: string | null;
}

/** Payload of a {@link SHOP_RETURN_REQUESTED_TYPE} row. */
export type ShopReturnRequestedPayload = {
  returnId: string;
  orderId: string;
  /** Units across all returned lines. */
  itemsCount: number;
  /** The reason, cut to {@link SHOP_EXCERPT_MAX_LENGTH}; null when none was given. */
  reason: string | null;
};

/**
 * Cut `value` to at most `max` characters, ending with `…` when it was cut.
 * Whitespace runs collapse first, so a message of blank lines costs nothing.
 * Counts code points, not UTF-16 units, so an emoji is never split in half.
 */
export function excerpt(value: string, max = SHOP_EXCERPT_MAX_LENGTH): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  return chars.length <= max
    ? flat
    : `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`;
}
