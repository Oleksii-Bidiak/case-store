import { NotificationAudience, NotificationChannel, Prisma } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import type { NotificationOutboxRepository } from '../notification-outbox/notification-outbox.repository';
// The e-mail's own type strings — the first spec below pins the Telegram ones to them.
import {
  ORDER_CONFIRMATION_MAIL_TYPE,
  ORDER_SHIPPED_MAIL_TYPE,
} from '../notification-outbox/notification-outbox.types';
import type { NotificationBindingRepository } from './notification-binding.repository';
import type { NotificationBindingEntity } from './entities/notification-binding.entity';
import { CustomerNotifier } from './customer-notifier.service';
import {
  CUSTOMER_ORDER_CONFIRMATION_TYPE,
  CUSTOMER_ORDER_SHIPPED_TYPE,
} from './customer-notification.types';

const ORDER_ID = 'ab12cd34-0000-4000-8000-000000000001';
const USER_ID = 'user-1';

const binding = (
  externalId: string,
  overrides: Partial<NotificationBindingEntity> = {},
): NotificationBindingEntity => ({
  id: `binding-${externalId}`,
  channel: NotificationChannel.TELEGRAM,
  audience: NotificationAudience.CUSTOMER,
  externalId,
  label: null,
  userId: USER_ID,
  orderId: null,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  revokedAt: null,
  ...overrides,
});

describe('CustomerNotifier (TASK-680)', () => {
  const bindings = { findActiveForCustomer: jest.fn(), findOrderSummary: jest.fn() };
  const outbox = { enqueue: jest.fn() };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  // A distinct object — the assertions check it is THIS one that travels.
  const tx = { marker: 'event-tx' } as unknown as Prisma.TransactionClient;
  let notifier: CustomerNotifier;

  beforeEach(() => {
    jest.clearAllMocks();
    outbox.enqueue.mockResolvedValue({});
    notifier = new CustomerNotifier(
      bindings as unknown as NotificationBindingRepository,
      outbox as unknown as NotificationOutboxRepository,
      logger as unknown as PinoLogger,
    );
  });

  // `type` says what happened, `channel` says where (TASK-672): the Telegram row
  // of an event carries the e-mail's own type string.
  it('uses the e-mail type strings for the same two events', () => {
    expect(CUSTOMER_ORDER_CONFIRMATION_TYPE).toBe(ORDER_CONFIRMATION_MAIL_TYPE);
    expect(CUSTOMER_ORDER_SHIPPED_TYPE).toBe(ORDER_SHIPPED_MAIL_TYPE);
  });

  describe('enqueueOrderConfirmation', () => {
    const order = { orderId: ORDER_ID, total: '1299.00', itemsCount: 2 };

    it('queues one TELEGRAM row per connected chat, through the given tx, with a small payload', async () => {
      bindings.findActiveForCustomer.mockResolvedValue([binding('111'), binding('222')]);

      await expect(notifier.enqueueOrderConfirmation(order, { userId: USER_ID }, tx)).resolves.toBe(
        2,
      );

      expect(bindings.findActiveForCustomer).toHaveBeenCalledWith(
        NotificationChannel.TELEGRAM,
        { userId: USER_ID },
        tx,
      );
      expect(outbox.enqueue).toHaveBeenCalledTimes(2);
      expect(outbox.enqueue.mock.calls.map(([params]) => params.recipientAddress)).toEqual([
        '111',
        '222',
      ]);
      const [params, passedTx] = outbox.enqueue.mock.calls[0];
      expect(passedTx).toBe(tx);
      expect(params).toEqual({
        type: CUSTOMER_ORDER_CONFIRMATION_TYPE,
        channel: NotificationChannel.TELEGRAM,
        recipientAddress: '111',
        payload: {
          orderId: ORDER_ID,
          orderNumber: 'AB12CD34',
          total: '1299.00',
          itemsCount: 2,
          // The gate's owner: the account picked by, and always the order itself.
          recipientOwner: { userId: USER_ID, orderId: ORDER_ID },
        },
      });
    });

    it('queues nothing and logs one info line when no chat is connected', async () => {
      bindings.findActiveForCustomer.mockResolvedValue([]);

      await expect(notifier.enqueueOrderConfirmation(order, { userId: USER_ID }, tx)).resolves.toBe(
        0,
      );

      expect(outbox.enqueue).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        {
          event: 'notification.customer.skipped',
          customerEvent: CUSTOMER_ORDER_CONFIRMATION_TYPE,
          reason: 'no-binding',
        },
        expect.any(String),
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('works without a tx (the operator phone order, after its commit)', async () => {
      bindings.findActiveForCustomer.mockResolvedValue([binding('111')]);

      await notifier.enqueueOrderConfirmation(order, { userId: USER_ID });

      expect(bindings.findActiveForCustomer).toHaveBeenCalledWith(
        NotificationChannel.TELEGRAM,
        { userId: USER_ID },
        undefined,
      );
      expect(outbox.enqueue.mock.calls[0][1]).toBeUndefined();
    });

    it('lets an outbox failure propagate — inside the order tx it rolls the order back', async () => {
      bindings.findActiveForCustomer.mockResolvedValue([binding('111')]);
      outbox.enqueue.mockRejectedValue(new Error('insert failed'));

      await expect(
        notifier.enqueueOrderConfirmation(order, { userId: USER_ID }, tx),
      ).rejects.toThrow('insert failed');
    });
  });

  describe('enqueueOrderShipped', () => {
    it('asks for the chats of the account OR the order and writes the parcel, never secrets', async () => {
      bindings.findActiveForCustomer.mockResolvedValue([binding('111'), binding('333')]);

      await expect(
        notifier.enqueueOrderShipped(
          { orderId: ORDER_ID, trackingNumber: ' 20450000000001 ', deliveryMethod: 'NOVA_POSHTA' },
          { userId: USER_ID, orderId: ORDER_ID },
        ),
      ).resolves.toBe(2);

      expect(bindings.findActiveForCustomer).toHaveBeenCalledWith(
        NotificationChannel.TELEGRAM,
        { userId: USER_ID, orderId: ORDER_ID },
        undefined,
      );
      expect(outbox.enqueue).toHaveBeenCalledTimes(2);
      const [params] = outbox.enqueue.mock.calls[0];
      expect(params.type).toBe(CUSTOMER_ORDER_SHIPPED_TYPE);
      expect(params.payload).toEqual({
        orderId: ORDER_ID,
        orderNumber: 'AB12CD34',
        trackingNumber: '20450000000001',
        deliveryMethod: 'NOVA_POSHTA',
        recipientOwner: { userId: USER_ID, orderId: ORDER_ID },
      });
    });

    it('stamps a guest order owner with no account', async () => {
      bindings.findActiveForCustomer.mockResolvedValue([binding('333', { userId: null })]);

      await notifier.enqueueOrderShipped(
        { orderId: ORDER_ID, trackingNumber: null },
        { userId: null, orderId: ORDER_ID },
      );

      expect(outbox.enqueue.mock.calls[0][0].payload).toEqual(
        expect.objectContaining({
          trackingNumber: null,
          deliveryMethod: null,
          recipientOwner: { userId: null, orderId: ORDER_ID },
        }),
      );
    });

    it('queues nothing when the order has no chat', async () => {
      bindings.findActiveForCustomer.mockResolvedValue([]);

      await expect(
        notifier.enqueueOrderShipped({ orderId: ORDER_ID }, { userId: null, orderId: ORDER_ID }),
      ).resolves.toBe(0);
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('onBindingCreated — the guest summary (owner decision 3)', () => {
    const guestBinding = binding('555', { userId: null, orderId: ORDER_ID });

    it('queues ONE confirmation row for exactly the new chat, through the exchange tx', async () => {
      bindings.findOrderSummary.mockResolvedValue({
        id: ORDER_ID,
        userId: null,
        total: '499.00',
        itemsCount: 3,
      });

      await expect(notifier.onBindingCreated(guestBinding, tx)).resolves.toBe(1);

      expect(bindings.findOrderSummary).toHaveBeenCalledWith(ORDER_ID, tx);
      // Only this chat — not every chat of the order.
      expect(bindings.findActiveForCustomer).not.toHaveBeenCalled();
      expect(outbox.enqueue).toHaveBeenCalledTimes(1);
      expect(outbox.enqueue).toHaveBeenCalledWith(
        {
          type: CUSTOMER_ORDER_CONFIRMATION_TYPE,
          channel: NotificationChannel.TELEGRAM,
          recipientAddress: '555',
          payload: {
            orderId: ORDER_ID,
            orderNumber: 'AB12CD34',
            total: '499.00',
            itemsCount: 3,
            recipientOwner: { userId: null, orderId: ORDER_ID },
          },
        },
        tx,
      );
    });

    it('sends nothing retroactive for an ACCOUNT binding', async () => {
      await expect(notifier.onBindingCreated(binding('111'), tx)).resolves.toBe(0);

      expect(bindings.findOrderSummary).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('sends nothing for a SHOP binding', async () => {
      await expect(
        notifier.onBindingCreated(
          binding('-100', { audience: NotificationAudience.SHOP, userId: 'admin-1' }),
          tx,
        ),
      ).resolves.toBe(0);

      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('sends nothing, and says why, when the order is gone', async () => {
      bindings.findOrderSummary.mockResolvedValue(null);

      await expect(notifier.onBindingCreated(guestBinding, tx)).resolves.toBe(0);

      expect(outbox.enqueue).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'notification.customer.skipped',
          reason: 'order-missing',
        }),
        expect.any(String),
      );
    });
  });
});
