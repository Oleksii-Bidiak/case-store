import { NotificationAudience, NotificationChannel, Prisma } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import type { NotificationOutboxRepository } from '../notification-outbox/notification-outbox.repository';
import type { NotificationBindingService } from './notification-binding.service';
import type { NotificationBindingEntity } from './entities/notification-binding.entity';
import { ShopNotifier } from './shop-notifier.service';
import {
  SHOP_CONTACT_MESSAGE_TYPE,
  SHOP_EXCERPT_MAX_LENGTH,
  SHOP_NEW_ORDER_TYPE,
  SHOP_RETURN_REQUESTED_TYPE,
  excerpt,
} from './shop-notification.types';

const binding = (externalId: string): NotificationBindingEntity => ({
  id: `binding-${externalId}`,
  channel: NotificationChannel.TELEGRAM,
  audience: NotificationAudience.SHOP,
  externalId,
  label: null,
  userId: null,
  orderId: null,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  revokedAt: null,
});

const order = {
  orderId: 'ab12cd34-0000-4000-8000-000000000001',
  total: '1299.00',
  paymentMethod: 'ON_DELIVERY',
  deliveryMethod: 'NOVA_POSHTA',
  itemsCount: 2,
  customerName: '  Іван  ',
  city: 'Київ',
};

describe('ShopNotifier (TASK-677)', () => {
  const bindings = { findActiveRecipients: jest.fn() };
  const outbox = { enqueue: jest.fn() };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  // A distinct object — the assertions check it is THIS one that travels, not the base client.
  const tx = { marker: 'order-tx' } as unknown as Prisma.TransactionClient;
  let notifier: ShopNotifier;

  beforeEach(() => {
    jest.clearAllMocks();
    outbox.enqueue.mockResolvedValue({});
    notifier = new ShopNotifier(
      bindings as unknown as NotificationBindingService,
      outbox as unknown as NotificationOutboxRepository,
      logger as unknown as PinoLogger,
    );
  });

  describe('with no SHOP chat connected', () => {
    beforeEach(() => bindings.findActiveRecipients.mockResolvedValue([]));

    it('queues nothing and logs exactly one notification.shop.skipped line', async () => {
      await expect(notifier.enqueueNewOrder(order, tx)).resolves.toBe(0);

      expect(outbox.enqueue).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        {
          event: 'notification.shop.skipped',
          shopEvent: SHOP_NEW_ORDER_TYPE,
          reason: 'no-binding',
        },
        expect.any(String),
      );
      // Expected before the owner connects a chat — not a warning, not an error.
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('names the event that was skipped', async () => {
      await notifier.enqueueContactMessage(
        { messageId: 'm-1', name: 'Олена', phone: '+380', message: 'Привіт' },
        tx,
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ shopEvent: SHOP_CONTACT_MESSAGE_TYPE }),
        expect.any(String),
      );
    });
  });

  describe('with two SHOP chats connected', () => {
    beforeEach(() =>
      bindings.findActiveRecipients.mockResolvedValue([binding('-1001'), binding('42')]),
    );

    it('queues one TELEGRAM row per chat, all through the event transaction', async () => {
      await expect(notifier.enqueueNewOrder(order, tx)).resolves.toBe(2);

      expect(bindings.findActiveRecipients).toHaveBeenCalledWith(
        NotificationChannel.TELEGRAM,
        NotificationAudience.SHOP,
        tx,
      );
      expect(outbox.enqueue).toHaveBeenCalledTimes(2);
      const payload = {
        orderId: order.orderId,
        total: '1299.00',
        paymentMethod: 'ON_DELIVERY',
        deliveryMethod: 'NOVA_POSHTA',
        itemsCount: 2,
        customerName: 'Іван',
        city: 'Київ',
      };
      expect(outbox.enqueue).toHaveBeenNthCalledWith(
        1,
        {
          type: SHOP_NEW_ORDER_TYPE,
          recipientAddress: '-1001',
          channel: NotificationChannel.TELEGRAM,
          payload,
        },
        tx,
      );
      expect(outbox.enqueue).toHaveBeenNthCalledWith(
        2,
        { type: SHOP_NEW_ORDER_TYPE, recipientAddress: '42', channel: 'TELEGRAM', payload },
        tx,
      );
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('queues the contact message with an excerpt, never the whole body', async () => {
      const long = 'а'.repeat(SHOP_EXCERPT_MAX_LENGTH + 50);

      await notifier.enqueueContactMessage(
        {
          messageId: 'm-1',
          name: 'Олена',
          phone: '+380671234567',
          email: '',
          topic: 'order',
          orderRef: null,
          message: long,
        },
        tx,
      );

      const [params, passedTx] = outbox.enqueue.mock.calls[0];
      expect(passedTx).toBe(tx);
      expect(params).toEqual({
        type: SHOP_CONTACT_MESSAGE_TYPE,
        recipientAddress: '-1001',
        channel: NotificationChannel.TELEGRAM,
        payload: {
          messageId: 'm-1',
          name: 'Олена',
          phone: '+380671234567',
          email: null,
          topic: 'order',
          orderRef: null,
          excerpt: excerpt(long),
        },
      });
      expect(Array.from(params.payload.excerpt as string)).toHaveLength(SHOP_EXCERPT_MAX_LENGTH);
    });

    it('queues the return request with its reason, or null for none', async () => {
      await notifier.enqueueReturnRequested(
        { returnId: 'r-1', orderId: 'o-1', itemsCount: 3, reason: '   ' },
        tx,
      );

      expect(outbox.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SHOP_RETURN_REQUESTED_TYPE,
          payload: { returnId: 'r-1', orderId: 'o-1', itemsCount: 3, reason: null },
        }),
        tx,
      );
    });

    it('lets an enqueue failure propagate, so the caller transaction rolls back', async () => {
      outbox.enqueue.mockRejectedValueOnce(new Error('insert failed'));

      await expect(notifier.enqueueNewOrder(order, tx)).rejects.toThrow('insert failed');
    });
  });
});

describe('excerpt', () => {
  it('keeps a short text whole, with whitespace runs collapsed', () => {
    expect(excerpt('  Доброго\n\n дня!  ')).toBe('Доброго дня!');
  });

  it('cuts a long text to the limit, ending with an ellipsis', () => {
    const cut = excerpt('слово '.repeat(100), 20);

    expect(Array.from(cut)).toHaveLength(20);
    expect(cut.endsWith('…')).toBe(true);
  });

  it('never splits an emoji in half', () => {
    const cut = excerpt('😀'.repeat(10), 5);

    expect(cut).toBe('😀😀😀😀…');
  });
});
