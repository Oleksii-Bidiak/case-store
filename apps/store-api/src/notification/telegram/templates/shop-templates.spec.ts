import {
  NotificationChannel,
  NotificationOutbox,
  NotificationOutboxStatus,
  Prisma,
} from '@prisma/client';
import type { TelegramRenderContext } from '../telegram-renderers';
import { renderShopNewOrder } from './shop-new-order';
import { renderShopContactMessage } from './shop-contact-message';
import { renderShopReturnRequested } from './shop-return-requested';

const ORDER_ID = 'ab12cd34-5678-4def-8000-000000000001';
const RETURN_ID = 'ffee0011-5678-4def-8000-000000000002';
const HOSTILE = '<b>&"x';
const HOSTILE_ESCAPED = '&lt;b&gt;&amp;&quot;x';

const row = (type: string, payload: Prisma.JsonValue): NotificationOutbox => ({
  id: 'row-1',
  type,
  channel: NotificationChannel.TELEGRAM,
  recipientAddress: '-1001',
  payload,
  status: NotificationOutboxStatus.PENDING,
  attempts: 0,
  maxAttempts: 5,
  lastError: null,
  nextAttemptAt: new Date('2026-10-01T00:00:00.000Z'),
  sentAt: null,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
});

/** STORE_ADMIN_URL set: the link is the admin origin plus the path. */
const withAdmin: TelegramRenderContext = {
  adminUrl: (path) => `https://admin.example.com${path}`,
};
/** STORE_ADMIN_URL unset (a dev box): no link at all. */
const withoutAdmin: TelegramRenderContext = { adminUrl: () => null };

/** uk-UA grouping uses a no-break space; compare on ordinary spaces. */
const plain = (value: string): string => value.replace(/[  ]/g, ' ');

describe('Telegram shop pings (TASK-677)', () => {
  describe('shop-new-order', () => {
    const payload = {
      orderId: ORDER_ID,
      total: '1299.00',
      paymentMethod: 'ON_DELIVERY',
      deliveryMethod: 'NOVA_POSHTA',
      itemsCount: 2,
      customerName: 'Іван',
      city: 'Київ',
    };

    it('renders the number, sum, methods, buyer and admin link', () => {
      const text = plain(renderShopNewOrder(row('shop-new-order', payload), withAdmin));

      expect(text).toBe(
        [
          '🛒 <b>Нове замовлення #AB12CD34</b>',
          'Сума: 1 299 ₴ · 2 шт.',
          'Оплата: післяплата · Доставка: Нова Пошта',
          'Покупець: Іван · Київ',
          `<a href="https://admin.example.com/orders/${ORDER_ID}">Відкрити в адмінці</a>`,
        ].join('\n'),
      );
    });

    it('formats the sum the way the confirmation letter does', () => {
      const text = plain(
        renderShopNewOrder(row('shop-new-order', { ...payload, total: '29.90' }), withAdmin),
      );

      expect(text).toContain('Сума: 29,9 ₴');
    });

    it('escapes a hostile buyer name and city', () => {
      const text = renderShopNewOrder(
        row('shop-new-order', { ...payload, customerName: HOSTILE, city: HOSTILE }),
        withAdmin,
      );

      expect(text).toContain(`Покупець: ${HOSTILE_ESCAPED} · ${HOSTILE_ESCAPED}`);
      expect(text).not.toContain(HOSTILE);
    });

    it('drops the link line when STORE_ADMIN_URL is not set', () => {
      const text = renderShopNewOrder(row('shop-new-order', payload), withoutAdmin);

      expect(text).not.toContain('<a ');
      expect(text).not.toContain('Відкрити в адмінці');
      expect(text.split('\n')).toHaveLength(4);
    });

    it('shows a payment method this build does not know as is, escaped', () => {
      const text = renderShopNewOrder(
        row('shop-new-order', { ...payload, paymentMethod: 'CRYPTO<>' }),
        withAdmin,
      );

      expect(text).toContain('Оплата: CRYPTO&lt;&gt;');
    });

    it('tolerates a payload missing its optional fields', () => {
      const text = renderShopNewOrder(
        row('shop-new-order', { orderId: ORDER_ID, total: '10.00' }),
        withoutAdmin,
      );

      expect(plain(text)).toBe('🛒 <b>Нове замовлення #AB12CD34</b>\nСума: 10 ₴');
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('null');
    });

    it('does not throw on a payload that is not an object', () => {
      expect(renderShopNewOrder(row('shop-new-order', null), withAdmin)).toBe(
        '🛒 <b>Нове замовлення</b>',
      );
    });
  });

  describe('shop-contact-message', () => {
    const payload = {
      messageId: 'm-1',
      name: 'Олена',
      phone: '+380671234567',
      email: 'olena@example.com',
      topic: 'order',
      orderRef: 'ORD-1',
      excerpt: 'Доброго дня! Де моє замовлення?',
    };

    it('renders the sender, contacts, excerpt and the unread inbox link', () => {
      expect(renderShopContactMessage(row('shop-contact-message', payload), withAdmin)).toBe(
        [
          '✉️ <b>Нове повідомлення</b> від Олена',
          'Телефон: +380671234567 · olena@example.com',
          'Тема: order · Замовлення: ORD-1',
          '«Доброго дня! Де моє замовлення?»',
          '<a href="https://admin.example.com/messages?status=NEW">Відкрити в адмінці</a>',
        ].join('\n'),
      );
    });

    it('escapes every person-supplied field', () => {
      const text = renderShopContactMessage(
        row('shop-contact-message', {
          ...payload,
          name: HOSTILE,
          phone: HOSTILE,
          email: HOSTILE,
          topic: HOSTILE,
          orderRef: HOSTILE,
          excerpt: HOSTILE,
        }),
        withAdmin,
      );

      expect(text).not.toContain(HOSTILE);
      expect(text.split(HOSTILE_ESCAPED)).toHaveLength(7);
    });

    it('drops the link without STORE_ADMIN_URL and the missing optional fields', () => {
      const text = renderShopContactMessage(
        row('shop-contact-message', {
          messageId: 'm-1',
          name: 'Олена',
          phone: '+380671234567',
          email: null,
          topic: null,
          orderRef: null,
          excerpt: 'Привіт',
        }),
        withoutAdmin,
      );

      expect(text).toBe(
        ['✉️ <b>Нове повідомлення</b> від Олена', 'Телефон: +380671234567', '«Привіт»'].join('\n'),
      );
    });
  });

  describe('shop-return-requested', () => {
    const payload = {
      returnId: RETURN_ID,
      orderId: ORDER_ID,
      itemsCount: 1,
      reason: 'Не підійшов розмір',
    };

    it('renders the order number, units, reason and the return link', () => {
      expect(renderShopReturnRequested(row('shop-return-requested', payload), withAdmin)).toBe(
        [
          '↩️ <b>Заявка на повернення</b> до замовлення #AB12CD34',
          'Повертають: 1 шт.',
          'Причина: «Не підійшов розмір»',
          `<a href="https://admin.example.com/returns/${RETURN_ID}">Відкрити в адмінці</a>`,
        ].join('\n'),
      );
    });

    it('escapes a hostile reason', () => {
      const text = renderShopReturnRequested(
        row('shop-return-requested', { ...payload, reason: HOSTILE }),
        withAdmin,
      );

      expect(text).toContain(`Причина: «${HOSTILE_ESCAPED}»`);
    });

    it('leaves out the reason when none was given, and the link without an origin', () => {
      const text = renderShopReturnRequested(
        row('shop-return-requested', { ...payload, reason: null }),
        withoutAdmin,
      );

      expect(text).toBe(
        '↩️ <b>Заявка на повернення</b> до замовлення #AB12CD34\nПовертають: 1 шт.',
      );
    });
  });
});
