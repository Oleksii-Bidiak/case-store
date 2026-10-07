import { Injectable } from '@nestjs/common';
import { NotificationAudience, NotificationChannel, Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
// eslint-disable-next-line local/no-deep-module-import -- cycle: notification-outbox barrel > notification-outbox.module > notification.module > this file
import { NotificationOutboxRepository } from '../notification-outbox/notification-outbox.repository';
import { orderNumber } from '../mail';
import {
  NotificationBindingRepository,
  type CustomerBindingOwner,
} from './notification-binding.repository';
import type { NotificationBindingEntity } from './entities/notification-binding.entity';
import {
  CUSTOMER_ORDER_CONFIRMATION_TYPE,
  CUSTOMER_ORDER_SHIPPED_TYPE,
  type CustomerNotificationType,
  type CustomerOrderConfirmationInput,
  type CustomerOrderConfirmationPayload,
  type CustomerOrderShippedInput,
  type CustomerOrderShippedPayload,
} from './customer-notification.types';

const TELEGRAM = NotificationChannel.TELEGRAM;

/**
 * CustomerNotifier — queues a buyer's own Telegram messages (TASK-680, plan 187):
 * the order confirmation and «відправлено», for the chats the buyer connected
 * (TASK-679). The twin of {@link ShopNotifier}.
 *
 * ## In addition to the e-mail, never instead of it
 *
 * Nothing here touches the e-mail rows. The callers queue the letter exactly as
 * before and call this next to it; a buyer with no chat gets the letter alone, a
 * buyer with one gets both (plan 187 constraint #3).
 *
 * ## Recipients
 *
 * Every active CUSTOMER chat of the owner — the account, the order, or both —
 * one row per CHAT: a chat connected to the account and to the order still gets
 * one message ({@link NotificationBindingRepository.findActiveForCustomer}
 * de-duplicates). With none, NOTHING is queued and one
 * `notification.customer.skipped` line is logged at info level — most buyers
 * never connect a chat.
 *
 * Each row carries `recipientOwner` (the account and the order), which the
 * Telegram send gate reads to check that the chat STILL follows this owner when
 * the row is sent — see `recipient-scope.ts`.
 *
 * ## Transactions
 *
 * `tx` is optional, unlike ShopNotifier's: the checkout passes the order's
 * transaction (constraint #2), while «відправлено» and the operator's phone
 * order are queued after their commit, exactly like their letters.
 */
@Injectable()
export class CustomerNotifier {
  constructor(
    private readonly bindings: NotificationBindingRepository,
    private readonly outbox: NotificationOutboxRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CustomerNotifier.name);
  }

  /** «Замовлення прийнято». Returns the number of rows queued. */
  async enqueueOrderConfirmation(
    order: CustomerOrderConfirmationInput,
    owner: CustomerBindingOwner,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const recipients = await this.recipients(CUSTOMER_ORDER_CONFIRMATION_TYPE, owner, tx);
    for (const chat of recipients) {
      await this.enqueue(
        CUSTOMER_ORDER_CONFIRMATION_TYPE,
        chat.externalId,
        confirmationPayload(order, ownerOf(owner, order.orderId)),
        tx,
      );
    }
    return recipients.length;
  }

  /** «Замовлення відправлено», with the waybill when there is one. Returns the number of rows queued. */
  async enqueueOrderShipped(
    order: CustomerOrderShippedInput,
    owner: CustomerBindingOwner,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const recipients = await this.recipients(CUSTOMER_ORDER_SHIPPED_TYPE, owner, tx);
    const payload: CustomerOrderShippedPayload = {
      orderId: order.orderId,
      orderNumber: orderNumber(order.orderId),
      trackingNumber: order.trackingNumber?.trim() || null,
      deliveryMethod: order.deliveryMethod ?? null,
      recipientOwner: ownerOf(owner, order.orderId),
    };
    for (const chat of recipients) {
      await this.enqueue(CUSTOMER_ORDER_SHIPPED_TYPE, chat.externalId, payload, tx);
    }
    return recipients.length;
  }

  /**
   * The guest's Telegram confirmation (owner decision 3, 2026-10-07).
   *
   * A guest can only connect a chat AFTER the order exists, so the confirmation
   * queued at checkout reached nobody on Telegram. The token exchange calls this
   * — inside its own transaction, and only when it CREATED the binding — and the
   * one chat that just connected gets the order summary. A re-press of the link
   * creates nothing and so sends nothing; an account's binding (no order) gets
   * nothing retroactive.
   *
   * Returns the number of rows queued (0 or 1).
   */
  async onBindingCreated(
    binding: NotificationBindingEntity,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    if (
      binding.audience !== NotificationAudience.CUSTOMER ||
      binding.channel !== TELEGRAM ||
      binding.orderId === null
    ) {
      return 0;
    }

    const order = await this.bindings.findOrderSummary(binding.orderId, tx);
    if (order === null) {
      this.logger.info(
        {
          event: 'notification.customer.skipped',
          customerEvent: CUSTOMER_ORDER_CONFIRMATION_TYPE,
          reason: 'order-missing',
          orderId: binding.orderId,
        },
        'The connected order no longer exists — no summary queued',
      );
      return 0;
    }

    await this.enqueue(
      CUSTOMER_ORDER_CONFIRMATION_TYPE,
      binding.externalId,
      confirmationPayload(
        { orderId: order.id, total: order.total, itemsCount: order.itemsCount },
        { userId: binding.userId, orderId: binding.orderId },
      ),
      tx,
    );
    this.logger.info(
      {
        event: 'notification.customer.summary_queued',
        orderId: order.id,
        bindingId: binding.id,
      },
      'Order summary queued for a newly connected guest chat',
    );
    return 1;
  }

  private async recipients(
    type: CustomerNotificationType,
    owner: CustomerBindingOwner,
    tx?: Prisma.TransactionClient,
  ): Promise<NotificationBindingEntity[]> {
    const recipients = await this.bindings.findActiveForCustomer(TELEGRAM, owner, tx);
    if (recipients.length === 0) {
      this.logger.info(
        { event: 'notification.customer.skipped', customerEvent: type, reason: 'no-binding' },
        'No customer chat is connected — Telegram notification not queued',
      );
    }
    return recipients;
  }

  private async enqueue(
    type: CustomerNotificationType,
    chatId: string,
    payload: Prisma.InputJsonObject,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.outbox.enqueue({ type, recipientAddress: chatId, channel: TELEGRAM, payload }, tx);
  }
}

function confirmationPayload(
  order: CustomerOrderConfirmationInput,
  recipientOwner: CustomerOrderConfirmationPayload['recipientOwner'],
): CustomerOrderConfirmationPayload {
  return {
    orderId: order.orderId,
    orderNumber: orderNumber(order.orderId),
    total: order.total,
    itemsCount: order.itemsCount,
    recipientOwner,
  };
}

/**
 * The owner stamped on the row for the send gate: the account the recipients
 * were picked by, and ALWAYS the order itself — a chat that still follows this
 * order (connected from the guest page) is a legitimate recipient even when it
 * was reached through the account.
 */
function ownerOf(
  owner: CustomerBindingOwner,
  orderId: string,
): CustomerOrderConfirmationPayload['recipientOwner'] {
  return { userId: owner.userId ?? null, orderId: owner.orderId ?? orderId };
}
