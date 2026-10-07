import {
  NotificationChannel,
  NotificationOutbox,
  NotificationOutboxStatus,
  Prisma,
} from '@prisma/client';
import type { TelegramRenderContext } from '../telegram-renderers';
import { renderOrderConfirmation } from './order-confirmation';
import { renderOrderShipped } from './order-shipped';

const ORDER_ID = 'ab12cd34-5678-4def-8000-000000000001';
const OWNER = { recipientOwner: { userId: 'user-1', orderId: ORDER_ID } };

const row = (type: string, payload: Prisma.JsonValue): NotificationOutbox => ({
  id: 'row-1',
  type,
  channel: NotificationChannel.TELEGRAM,
  recipientAddress: '42',
  payload,
  status: NotificationOutboxStatus.PENDING,
  attempts: 0,
  maxAttempts: 5,
  lastError: null,
  nextAttemptAt: new Date('2026-10-01T00:00:00.000Z'),
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  sentAt: null,
});

/** STORE_CLIENT_URL set: «Статус замовлення» opens the public lookup. */
const withStore: TelegramRenderContext = {
  adminUrl: (path) => `https://admin.example.com${path}`,
  storeUrl: (path) => `https://shop.example.com${path}`,
};
/** STORE_CLIENT_URL unset (a dev box): no link at all. */
const withoutStore: TelegramRenderContext = { adminUrl: () => null, storeUrl: () => null };

/** uk-UA grouping uses a no-break space; compare on ordinary spaces. */
const plain = (value: string): string => value.replace(/[  ]/g, ' ');

describe('Telegram customer messages (TASK-680)', () => {
  describe('order-confirmation', () => {
    const payload = {
      orderId: ORDER_ID,
      orderNumber: 'AB12CD34',
      total: '1299.00',
      itemsCount: 2,
      ...OWNER,
    };

    it('renders the number, the sum and the status link — a short text, not the letter', () => {
      const text = plain(renderOrderConfirmation(row('order-confirmation', payload), withStore));

      expect(text).toBe(
        [
          '✅ <b>Замовлення #AB12CD34 прийнято</b>',
          'Сума: 1 299 ₴ · 2 шт.',
          'Ми повідомимо, коли посилка вирушить.',
          '<a href="https://shop.example.com/orders/status">Статус замовлення</a>',
        ].join('\n'),
      );
    });

    it('never links to the admin panel', () => {
      const text = renderOrderConfirmation(row('order-confirmation', payload), withStore);

      expect(text).not.toContain('admin.example.com');
    });

    it('drops the link line when STORE_CLIENT_URL is not set', () => {
      const text = renderOrderConfirmation(row('order-confirmation', payload), withoutStore);

      expect(text).not.toContain('<a ');
      expect(text).not.toContain('Статус замовлення');
    });

    it('derives the number from the id when an older row has none', () => {
      const text = renderOrderConfirmation(
        row('order-confirmation', { orderId: ORDER_ID, total: '10.00', itemsCount: 1 }),
        withoutStore,
      );

      expect(text).toContain('#AB12CD34');
    });

    it('escapes a hostile number rather than break the HTML parse', () => {
      const text = renderOrderConfirmation(
        row('order-confirmation', { ...payload, orderNumber: '<b>&"x' }),
        withoutStore,
      );

      expect(text).toContain('#&lt;b&gt;&amp;&quot;x');
    });

    it('survives an empty payload with a generic headline, never "undefined"', () => {
      const text = renderOrderConfirmation(row('order-confirmation', {}), withoutStore);

      expect(text).toBe(
        ['✅ <b>Замовлення прийнято</b>', 'Ми повідомимо, коли посилка вирушить.'].join('\n'),
      );
      expect(text).not.toMatch(/undefined|null/);
    });

    it('promises a call, not a parcel, for a PICKUP order — like the letter', () => {
      const text = renderOrderConfirmation(
        row('order-confirmation', { ...payload, deliveryMethod: 'PICKUP', status: null }),
        withoutStore,
      );

      expect(text).toContain('Зателефонуємо, коли замовлення буде готове до видачі.');
      expect(text).not.toContain('посилка');
    });

    it('keeps the parcel promise for a delivered order (NOVA_POSHTA, COURIER)', () => {
      for (const deliveryMethod of ['NOVA_POSHTA', 'COURIER']) {
        const text = renderOrderConfirmation(
          row('order-confirmation', { ...payload, deliveryMethod, status: 'PENDING' }),
          withoutStore,
        );

        expect(text).toContain('Ми повідомимо, коли посилка вирушить.');
      }
    });

    it.each([
      ['NOVA_POSHTA', 'SHIPPED', 'Посилка вже вирушила.'],
      ['PICKUP', 'SHIPPED', 'Замовлення вже готове до видачі.'],
      ['NOVA_POSHTA', 'DELIVERED', 'Замовлення вже доставлено.'],
      ['PICKUP', 'DELIVERED', 'Замовлення вже видано.'],
    ])(
      'a guest summary for a %s order already %s says so instead of promising news (owner decision 3)',
      (deliveryMethod, status, expected) => {
        const text = renderOrderConfirmation(
          row('order-confirmation', { ...payload, deliveryMethod, status }),
          withoutStore,
        );

        expect(text).toContain(expected);
        expect(text).not.toContain('Ми повідомимо');
        expect(text).not.toContain('Зателефонуємо');
      },
    );
  });

  describe('order-shipped', () => {
    const payload = {
      orderId: ORDER_ID,
      orderNumber: 'AB12CD34',
      trackingNumber: '20450000000001',
      deliveryMethod: 'NOVA_POSHTA',
      ...OWNER,
    };

    it('renders the carrier, the copyable waybill, NP tracking and the status link', () => {
      const text = renderOrderShipped(row('order-shipped', payload), withStore);

      expect(text).toBe(
        [
          '🚚 <b>Замовлення #AB12CD34 відправлено</b>',
          'Доставка: Нова Пошта · ТТН: <code>20450000000001</code>',
          '<a href="https://novaposhta.ua/tracking/?cargo_number=20450000000001">Відстежити посилку</a>',
          '<a href="https://shop.example.com/orders/status">Статус замовлення</a>',
        ].join('\n'),
      );
    });

    it('still says «відправлено» before the waybill is entered — no ТТН line, no tracking link', () => {
      const text = renderOrderShipped(
        row('order-shipped', { ...payload, trackingNumber: null }),
        withoutStore,
      );

      expect(text).toBe(
        ['🚚 <b>Замовлення #AB12CD34 відправлено</b>', 'Доставка: Нова Пошта'].join('\n'),
      );
    });

    it('prints no Nova Poshta tracking link for another carrier', () => {
      const text = renderOrderShipped(
        row('order-shipped', { ...payload, deliveryMethod: 'COURIER', trackingNumber: 'C-1' }),
        withoutStore,
      );

      expect(text).toContain('Доставка: курʼєр · ТТН: <code>C-1</code>');
      expect(text).not.toContain('novaposhta.ua');
    });

    it('escapes a hostile waybill in the text and in the link', () => {
      const text = renderOrderShipped(
        row('order-shipped', { ...payload, trackingNumber: '<x>&"' }),
        withoutStore,
      );

      expect(text).toContain('<code>&lt;x&gt;&amp;&quot;</code>');
      expect(text).toContain('cargo_number=%3Cx%3E%26%22');
    });

    it('says «готове до видачі» for a PICKUP order — no carrier, no waybill, no tracking', () => {
      const text = renderOrderShipped(
        row('order-shipped', { ...payload, deliveryMethod: 'PICKUP', trackingNumber: null }),
        withStore,
      );

      expect(text).toBe(
        [
          '📦 <b>Замовлення #AB12CD34 готове до видачі</b>',
          'Візьміть із собою номер замовлення.',
          '<a href="https://shop.example.com/orders/status">Статус замовлення</a>',
        ].join('\n'),
      );
      expect(text).not.toContain('відправлено');
    });
  });
});
