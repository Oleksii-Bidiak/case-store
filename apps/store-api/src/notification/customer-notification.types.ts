import type { RecipientOwnerPayload } from './recipient-scope';

/**
 * The customer's own Telegram notifications (TASK-680, plan 187): the order
 * confirmation and «відправлено», sent to the chats a buyer connected IN
 * ADDITION to the e-mail — never instead of it.
 *
 * The `type` strings are the e-mail's own (`ORDER_CONFIRMATION_MAIL_TYPE`,
 * `ORDER_SHIPPED_MAIL_TYPE`): `type` says what happened, `channel` says where
 * (TASK-672). They are repeated here rather than imported because the outbox
 * module imports this one; `customer-notifier.service.spec.ts` pins the two
 * pairs equal, so they cannot drift apart.
 *
 * The payloads are SMALL and carry nothing secret: ids, the short number, the
 * sum, the parcel. Never the e-mail payload (an address, a name, the guest's
 * status-link token) — a chat is a weaker place to keep things than a mailbox,
 * and the message only needs to say what happened and where to look.
 */

/** `NotificationOutbox.type` of the order confirmation — the e-mail's own string. */
export const CUSTOMER_ORDER_CONFIRMATION_TYPE = 'order-confirmation';

/** `NotificationOutbox.type` of «замовлення відправлено» — the e-mail's own string. */
export const CUSTOMER_ORDER_SHIPPED_TYPE = 'order-shipped';

export type CustomerNotificationType =
  typeof CUSTOMER_ORDER_CONFIRMATION_TYPE | typeof CUSTOMER_ORDER_SHIPPED_TYPE;

/** What an order event gives the notifier for a confirmation. */
export interface CustomerOrderConfirmationInput {
  orderId: string;
  /** `Order.total` as stored — a 2-dp decimal string, UAH. */
  total: string;
  /** Units across all lines. */
  itemsCount: number;
  /**
   * `DeliveryMethod` value. A PICKUP order is not a parcel: its message says the
   * shop will call when it is ready, like the letter's pickup note.
   */
  deliveryMethod?: string | null;
  /**
   * `OrderStatus` value when the message is queued. Only the guest summary sets
   * it — a guest may connect long after checkout, when the order has already
   * gone out; at checkout the order is new by definition.
   */
  status?: string | null;
}

/** What an order event gives the notifier for «відправлено». */
export interface CustomerOrderShippedInput {
  orderId: string;
  /** The waybill, when the operator has entered it. */
  trackingNumber?: string | null;
  /** `DeliveryMethod` value — who carries the parcel. */
  deliveryMethod?: string | null;
}

/*
 * Type aliases, not interfaces: only an object type alias is assignable to
 * Prisma's JSON input (an interface has no implicit index signature).
 */

/** Payload of a TELEGRAM {@link CUSTOMER_ORDER_CONFIRMATION_TYPE} row. */
export type CustomerOrderConfirmationPayload = RecipientOwnerPayload & {
  orderId: string;
  /** What the customer reads in the letter and on the site — first 8 of the id. */
  orderNumber: string;
  total: string;
  itemsCount: number;
  deliveryMethod: string | null;
  /** Null for a confirmation queued at checkout (the order is new). */
  status: string | null;
};

/** Payload of a TELEGRAM {@link CUSTOMER_ORDER_SHIPPED_TYPE} row. */
export type CustomerOrderShippedPayload = RecipientOwnerPayload & {
  orderId: string;
  orderNumber: string;
  trackingNumber: string | null;
  deliveryMethod: string | null;
};
