import { Injectable } from '@nestjs/common';
import { NotificationAudience, NotificationChannel, Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
// eslint-disable-next-line local/no-deep-module-import -- cycle: notification-outbox barrel > notification-outbox.module > notification.module > this file
import { NotificationOutboxRepository } from '../notification-outbox/notification-outbox.repository';
import { NotificationBindingService } from './notification-binding.service';
import {
  SHOP_CONTACT_MESSAGE_TYPE,
  SHOP_NEW_ORDER_TYPE,
  SHOP_RETURN_REQUESTED_TYPE,
  excerpt,
  type ShopContactMessageInput,
  type ShopContactMessagePayload,
  type ShopNewOrderPayload,
  type ShopNotificationType,
  type ShopReturnRequestedInput,
  type ShopReturnRequestedPayload,
} from './shop-notification.types';

/**
 * ShopNotifier — queues the shop's own Telegram pings (TASK-677, plan 187).
 *
 * ## Constraint #2 of plan 187, enforced by the signature
 *
 * Every method takes the EVENT's transaction client, and it is not optional:
 * the rows are written in the same transaction as the order, the contact
 * message or the return, so they commit together or not at all. Nothing here
 * talks to Telegram — the outbox worker sends later. An `await bot.send()` in
 * the middle of a service would either roll back a paid order on a Telegram
 * timeout or announce an event that never happened.
 *
 * ## Recipients
 *
 * Every active TELEGRAM binding with audience SHOP gets its own row
 * (`recipientAddress` = the chat id), read through the same `tx`. With none,
 * NOTHING is queued and one `notification.shop.skipped` line is logged at info
 * level — expected until the owner connects a chat, and a row with no recipient
 * would only fail forever.
 *
 * Channel health is deliberately NOT checked here (constraint #1): with a
 * binding but no bot token the rows are still queued, and the outbox keeps them
 * PENDING while shouting about the channel — so they are delivered once the
 * token is fixed, instead of being silently dropped at enqueue time.
 */
@Injectable()
export class ShopNotifier {
  constructor(
    private readonly bindings: NotificationBindingService,
    private readonly outbox: NotificationOutboxRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ShopNotifier.name);
  }

  /** A customer placed an order on the storefront. Returns the number of rows queued. */
  enqueueNewOrder(order: ShopNewOrderPayload, tx: Prisma.TransactionClient): Promise<number> {
    const payload: ShopNewOrderPayload = {
      orderId: order.orderId,
      total: order.total,
      paymentMethod: order.paymentMethod,
      deliveryMethod: order.deliveryMethod,
      itemsCount: order.itemsCount,
      customerName: order.customerName?.trim() || null,
      city: order.city?.trim() || null,
    };
    return this.enqueue(SHOP_NEW_ORDER_TYPE, payload, tx);
  }

  /** The storefront contact form was submitted (never for a SPAM row). */
  enqueueContactMessage(
    message: ShopContactMessageInput,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const payload: ShopContactMessagePayload = {
      messageId: message.messageId,
      name: message.name,
      phone: message.phone,
      email: message.email || null,
      topic: message.topic || null,
      orderRef: message.orderRef || null,
      excerpt: excerpt(message.message),
    };
    return this.enqueue(SHOP_CONTACT_MESSAGE_TYPE, payload, tx);
  }

  /** A customer requested a return from their account (not one an operator opened). */
  enqueueReturnRequested(
    ret: ShopReturnRequestedInput,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const reason = ret.reason?.trim() ? excerpt(ret.reason) : null;
    const payload: ShopReturnRequestedPayload = {
      returnId: ret.returnId,
      orderId: ret.orderId,
      itemsCount: ret.itemsCount,
      reason,
    };
    return this.enqueue(SHOP_RETURN_REQUESTED_TYPE, payload, tx);
  }

  private async enqueue(
    type: ShopNotificationType,
    payload: Prisma.InputJsonObject,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const recipients = await this.bindings.findActiveRecipients(
      NotificationChannel.TELEGRAM,
      NotificationAudience.SHOP,
      tx,
    );

    if (recipients.length === 0) {
      this.logger.info(
        { event: 'notification.shop.skipped', shopEvent: type, reason: 'no-binding' },
        'No shop chat is connected — notification not queued',
      );
      return 0;
    }

    // Sequential on purpose: one interactive transaction is one connection, and
    // Prisma does not run statements on it in parallel anyway.
    for (const recipient of recipients) {
      await this.outbox.enqueue(
        {
          type,
          recipientAddress: recipient.externalId,
          channel: NotificationChannel.TELEGRAM,
          payload,
        },
        tx,
      );
    }
    return recipients.length;
  }
}
