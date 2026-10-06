import {
  buildOrderConfirmationEmail,
  type OrderConfirmationParams,
} from './order-confirmation.template';

// ─── Test fixtures ──────────────────────────────────────────────────────────

const baseParams = (overrides: Partial<OrderConfirmationParams> = {}): OrderConfirmationParams => ({
  customerName: 'Olena',
  order: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    createdAt: new Date('2026-06-11T12:00:00.000Z'),
    items: [
      {
        productName: 'iPhone 15 Pro Case',
        quantity: 2,
        price: '29.99',
        lineTotal: '59.98',
      },
      {
        productName: 'Screen Protector',
        quantity: 1,
        price: '9.99',
        lineTotal: '9.99',
      },
    ],
    subtotal: '69.97',
    discount: '0.00',
    shippingCost: '0.00',
    tax: '0.00',
    total: '69.97',
    shippingAddress: {
      firstName: 'Olena',
      lastName: 'Shevchenko',
      address1: 'vul. Khreshchatyk 1',
      city: 'Kyiv',
      postalCode: '01001',
      country: 'UA',
    },
  },
  ...overrides,
});

/** Strip HTML tags so we can assert the plain-text body carries no markup. */
const hasHtmlTags = (s: string): boolean => /<[a-z][\s\S]*>/i.test(s);

describe('buildOrderConfirmationEmail', () => {
  describe('subject', () => {
    it('contains the first 8 characters of the order id (order number prefix)', () => {
      const { subject } = buildOrderConfirmationEmail(baseParams());
      expect(subject).toContain('550E8400');
    });

    it('is written in Ukrainian', () => {
      const { subject } = buildOrderConfirmationEmail(baseParams());
      expect(subject).toContain('підтверджено');
    });
  });

  describe('Ukrainian localization', () => {
    it('renders the heading and order-received copy in Ukrainian', () => {
      const { html, text } = buildOrderConfirmationEmail(baseParams());
      expect(html).toContain('Дякуємо за ваше замовлення');
      expect(html).toContain('отримано');
      expect(text).toContain('Дякуємо за ваше замовлення');
    });

    it('uses the ₴ hryvnia symbol for money and no $ sign', () => {
      const { html, text } = buildOrderConfirmationEmail(baseParams());
      expect(html).toContain('₴');
      expect(html).not.toContain('$');
      expect(text).toContain('₴');
      expect(text).not.toContain('$');
    });

    // TASK-801: the same string the storefront shows for the same order.
    it('formats money like the storefront — grouped, comma decimals, no trailing zeros', () => {
      // Intl groups with NBSP or narrow NBSP depending on the ICU build.
      const plain = (value: string) => value.replace(/[\u00a0\u202f]/g, ' ');
      const { html, text } = buildOrderConfirmationEmail(
        baseParams({
          order: {
            ...baseParams().order,
            items: [
              {
                productName: 'MacBook Case',
                quantity: 1,
                price: '1299.00',
                lineTotal: '1299.00',
              },
              {
                productName: 'Screen Protector',
                quantity: 1,
                price: '29.99',
                lineTotal: '29.99',
              },
            ],
            subtotal: '1328.99',
            total: '1328.99',
          },
        }),
      );

      expect(plain(text)).toContain('MacBook Case x1 — 1 299 ₴');
      expect(plain(text)).toContain('Screen Protector x1 — 29,99 ₴');
      expect(plain(text)).toContain('Разом: 1 328,99 ₴');
      expect(plain(html)).toContain('1 299 ₴');
      expect(plain(html)).toContain('29,99 ₴');
      // The raw Decimal string must not leak into either body.
      expect(text).not.toContain('1299.00');
      expect(html).not.toContain('1299.00');
    });

    it('localizes the table headers and totals labels', () => {
      const { html } = buildOrderConfirmationEmail(baseParams());
      expect(html).toContain('Товар');
      expect(html).toContain('Разом');
    });

    it('declares the HTML document language as uk', () => {
      const { html } = buildOrderConfirmationEmail(baseParams());
      expect(html).toContain('lang="uk"');
      expect(html).not.toContain('lang="en"');
    });
  });

  describe('html body', () => {
    it("contains every item's product name", () => {
      const { html } = buildOrderConfirmationEmail(baseParams());
      expect(html).toContain('iPhone 15 Pro Case');
      expect(html).toContain('Screen Protector');
    });

    it("contains every item's quantity and line total", () => {
      const { html } = buildOrderConfirmationEmail(baseParams());
      expect(html).toContain('59,98');
      expect(html).toContain('9,99 ₴');
      // quantities
      expect(html).toMatch(/\b2\b/);
      expect(html).toMatch(/\b1\b/);
    });

    it('contains the grand total', () => {
      const { html } = buildOrderConfirmationEmail(baseParams());
      expect(html).toContain('69,97');
    });

    it('contains the shipping recipient full name', () => {
      const { html } = buildOrderConfirmationEmail(baseParams());
      expect(html).toContain('Olena Shevchenko');
    });
  });

  describe('text body', () => {
    it('contains the same key information with no HTML tags', () => {
      const { text } = buildOrderConfirmationEmail(baseParams());
      expect(text).toContain('550E8400');
      expect(text).toContain('iPhone 15 Pro Case');
      expect(text).toContain('Screen Protector');
      expect(text).toContain('59,98');
      expect(text).toContain('69,97');
      expect(text).toContain('Olena Shevchenko');
      expect(hasHtmlTags(text)).toBe(false);
    });
  });

  describe('greeting', () => {
    it('includes the customer name when provided', () => {
      const { html, text } = buildOrderConfirmationEmail(baseParams({ customerName: 'Dmytro' }));
      expect(html).toContain('Dmytro');
      expect(text).toContain('Dmytro');
    });

    it('falls back to a generic greeting when no customer name is given', () => {
      const params = baseParams();
      delete params.customerName;
      const { html, text } = buildOrderConfirmationEmail(params);
      expect(html.length).toBeGreaterThan(0);
      expect(text.length).toBeGreaterThan(0);
      // no "undefined" leaking into the copy
      expect(html).not.toContain('undefined');
      expect(text).not.toContain('undefined');
    });
  });

  // ─── TASK-483: the route back that does not depend on this letter ───────────

  describe('public lookup link', () => {
    const LOOKUP_URL = 'https://shop.example.com/orders/status';

    it('carries the lookup link in BOTH parts when one is supplied', () => {
      const { html, text } = buildOrderConfirmationEmail(
        baseParams({ orderLookupUrl: LOOKUP_URL }),
      );

      expect(html).toContain(LOOKUP_URL);
      // The plain-text part matters most here: a client that strips HTML is
      // exactly the one whose reader is most likely to lose the link.
      expect(text).toContain(LOOKUP_URL);
    });

    it('is sent to ACCOUNT buyers too — there is no token link for them', () => {
      const { html } = buildOrderConfirmationEmail(baseParams({ orderLookupUrl: LOOKUP_URL }));

      expect(html).not.toContain('/orders/guest/');
      expect(html).toContain(LOOKUP_URL);
    });

    it('stops claiming the emailed link is the ONLY way in once the form exists', () => {
      const withForm = buildOrderConfirmationEmail(
        baseParams({
          orderStatusUrl: 'https://shop.example.com/orders/guest/tok',
          orderLookupUrl: LOOKUP_URL,
        }),
      );
      const withoutForm = buildOrderConfirmationEmail(
        baseParams({ orderStatusUrl: 'https://shop.example.com/orders/guest/tok' }),
      );

      expect(withoutForm.html).toContain('єдиний спосіб');
      expect(withForm.html).not.toContain('єдиний спосіб');
      expect(withForm.text).not.toContain('єдиний спосіб');
    });

    it('renders nothing (and no "undefined") when no lookup URL is configured', () => {
      const { html, text } = buildOrderConfirmationEmail(baseParams());

      expect(html).not.toContain('undefined');
      expect(text).not.toContain('undefined');
      expect(html).not.toContain('/orders/status');
    });
  });

  describe('edge cases', () => {
    it('omits the address block (no crash) when shippingAddress is null', () => {
      const params = baseParams();
      params.order.shippingAddress = null;
      expect(() => buildOrderConfirmationEmail(params)).not.toThrow();
      const { html, text } = buildOrderConfirmationEmail(params);
      expect(html).not.toContain('undefined');
      expect(text).not.toContain('undefined');
    });

    it('handles an empty items array without crashing', () => {
      const params = baseParams();
      params.order.items = [];
      expect(() => buildOrderConfirmationEmail(params)).not.toThrow();
      const { html, text } = buildOrderConfirmationEmail(params);
      expect(html).toContain('69,97');
      expect(text).toContain('69,97');
    });

    // TASK-229: country/postalCode are optional on AddressDto — a minimal valid
    // API payload used to crash the renderer (`undefined` into escapeHtml) and
    // drive the outbox row to terminal FAILED.
    it('renders a minimal address (no country/postalCode) without crashing or leaking "undefined"', () => {
      const params = baseParams();
      params.order.shippingAddress = {
        firstName: 'Проба',
        lastName: '229',
        address1: 'вул. Тестова, 1',
        city: 'Київ',
        phone: '+380501234567',
      };
      expect(() => buildOrderConfirmationEmail(params)).not.toThrow();
      const { html, text } = buildOrderConfirmationEmail(params);
      expect(html).toContain('Проба 229');
      expect(html).toContain('Київ');
      expect(html).not.toContain('undefined');
      expect(text).not.toContain('undefined');
    });
  });

  // ─── TASK-647: the «Доставка» total and block, per method ───────────────────

  describe('delivery (TASK-647)', () => {
    // Intl groups with NBSP or narrow NBSP depending on the ICU build.
    const plain = (value: string) => value.replace(/[  ]/g, ' ');
    const recipient = { firstName: 'Олена', lastName: 'Коваль', phone: '+380 50 123 4567' };

    const render = (order: Partial<OrderConfirmationParams['order']>) =>
      buildOrderConfirmationEmail(baseParams({ order: { ...baseParams().order, ...order } }));

    it('Nova Poshta: amount row, method, branch, city and phone in both parts', () => {
      const { html, text } = render({
        deliveryMethod: 'NOVA_POSHTA',
        shippingCost: '85.00',
        total: '154.97',
        shippingAddress: {
          ...recipient,
          address1: 'Відділення №1: вул. Пилипа Орлика, 1',
          city: 'Київ',
          npCityRef: 'city-ref',
          npWarehouseRef: 'wh-ref',
          npWarehouseName: 'Відділення №1: вул. Пилипа Орлика, 1',
          deliveryMethod: 'NOVA_POSHTA',
          carrier: 'NOVA_POSHTA',
        },
      });

      expect(html).toContain('<h3 style="margin:0 0 8px;font-size:16px;">Доставка</h3>');
      expect(html).toContain('<p style="margin:0 0 4px;font-weight:bold;">Нова Пошта</p>');
      expect(html).toContain(
        'Олена Коваль<br />Відділення №1: вул. Пилипа Орлика, 1<br />Київ<br />+380 50 123 4567',
      );
      expect(html).not.toContain('Адреса доставки');
      expect(plain(html)).toContain('85 ₴');
      expect(plain(text)).toContain(
        [
          'Сума: 69,97 ₴',
          'Доставка: 85 ₴',
          'Разом: 154,97 ₴',
          '',
          'Доставка:',
          'Нова Пошта',
          'Олена Коваль',
          'Відділення №1: вул. Пилипа Орлика, 1',
          'Київ',
          '+380 50 123 4567',
        ].join('\n'),
      );
      expect(html).not.toContain('уточнить оператор');
    });

    it('Nova Poshta at cost 0 reads «Безкоштовно» in green, not «0 ₴»', () => {
      const { html, text } = render({
        deliveryMethod: 'NOVA_POSHTA',
        shippingAddress: {
          ...recipient,
          address1: 'Відділення №12',
          city: 'Київ',
          npWarehouseName: 'Відділення №12',
        },
      });

      expect(html).toContain(
        '<td style="padding:4px 8px;text-align:right;color:#15803d;font-weight:bold;">Безкоштовно</td>',
      );
      expect(text).toContain('Доставка: Безкоштовно');
      expect(plain(html)).not.toContain('>0 ₴');
      expect(plain(text)).not.toContain('Доставка: 0');
    });

    it('Pickup: point name, address, hours, phone, recipient, map link and note', () => {
      const { html, text } = render({
        deliveryMethod: 'PICKUP',
        shippingAddress: {
          ...recipient,
          address1: 'вул. Хрещатик, 22',
          city: 'Київ',
          deliveryMethod: 'PICKUP',
          carrier: null,
          pickupPointName: 'Магазин на Хрещатику',
          pickupPointAddress: 'вул. Хрещатик, 22',
          pickupPointHours: 'Пн–Сб 10:00–20:00, Нд 11:00–18:00',
          pickupPointPhone: '+380 44 123 45 67',
          pickupPointMapUrl: 'https://maps.google.com/?q=Хрещатик+22',
        },
      });

      expect(html).toContain(
        '<p style="margin:0 0 4px;font-weight:bold;">Самовивіз · Магазин на Хрещатику</p>',
      );
      expect(html).toContain(
        'Київ, вул. Хрещатик, 22<br />Пн–Сб 10:00–20:00, Нд 11:00–18:00<br />+380 44 123 45 67<br />Отримувач: Олена Коваль, +380 50 123 4567',
      );
      expect(html).toContain(
        '<a href="https://maps.google.com/?q=Хрещатик+22" style="color:#0f172a;">Як дістатися — відкрити на мапі</a>',
      );
      expect(html).toContain('background:#f1f5f9;');
      expect(html).toContain(
        'Зателефонуємо, коли замовлення буде готове до видачі. Візьміть із собою номер замовлення.',
      );
      expect(html).toContain('>Безкоштовно</td>');
      expect(text).toContain(
        [
          'Доставка:',
          'Самовивіз · Магазин на Хрещатику',
          'Київ, вул. Хрещатик, 22',
          'Пн–Сб 10:00–20:00, Нд 11:00–18:00',
          '+380 44 123 45 67',
          'Отримувач: Олена Коваль, +380 50 123 4567',
          'Мапа: https://maps.google.com/?q=Хрещатик+22',
          'Зателефонуємо, коли замовлення буде готове до видачі. Візьміть із собою номер замовлення.',
        ].join('\n'),
      );
      expect(text).toContain('Доставка: Безкоштовно');
    });

    it('Pickup without hours, point phone or map renders none of them (and no "undefined")', () => {
      const { html, text } = render({
        deliveryMethod: 'PICKUP',
        shippingAddress: {
          ...recipient,
          address1: 'вул. Хрещатик, 22',
          city: 'Київ',
          pickupPointName: 'Магазин',
          pickupPointAddress: 'вул. Хрещатик, 22',
          pickupPointHours: null,
          pickupPointPhone: null,
          pickupPointMapUrl: null,
        },
      });

      expect(html).not.toContain('Як дістатися');
      expect(text).not.toContain('Мапа:');
      expect(html).not.toContain('undefined');
      expect(text).not.toContain('undefined');
      expect(html).not.toContain('null');
      expect(text).not.toContain('null');
    });

    it('never turns a non-http map link into an href', () => {
      const { html, text } = render({
        deliveryMethod: 'PICKUP',
        shippingAddress: {
          ...recipient,
          address1: 'вул. Хрещатик, 22',
          city: 'Київ',
          pickupPointName: 'Магазин',
          pickupPointMapUrl: 'javascript:alert(1)',
        },
      });

      expect(html).not.toContain('javascript:');
      expect(text).not.toContain('javascript:');
    });

    it("Courier: «Кур'єр», then name / street / city / phone", () => {
      const { html, text } = render({
        deliveryMethod: 'COURIER',
        shippingAddress: {
          ...recipient,
          address1: 'вул. Січових Стрільців, 37, кв. 12',
          city: 'Київ',
          country: 'UA',
          deliveryMethod: 'COURIER',
          carrier: null,
        },
      });

      expect(html).toContain('<p style="margin:0 0 4px;font-weight:bold;">Кур\'єр</p>');
      expect(html).toContain(
        'Олена Коваль<br />вул. Січових Стрільців, 37, кв. 12<br />Київ<br />+380 50 123 4567',
      );
      expect(text).toContain(
        [
          'Доставка:',
          "Кур'єр",
          'Олена Коваль',
          'вул. Січових Стрільців, 37, кв. 12',
          'Київ',
          '+380 50 123 4567',
        ].join('\n'),
      );
      expect(text).toContain('Доставка: Безкоштовно');
      expect(html).not.toContain('background:#f1f5f9;');
    });

    it('Other: «уточнить оператор», the pending note under «Разом» and the operator note', () => {
      const { html, text } = render({
        deliveryMethod: 'OTHER',
        shippingAddress: {
          ...recipient,
          address1: 'Укрпошта, індекс 88000, вул. Корзо, 5',
          city: 'Ужгород',
          deliveryMethod: 'OTHER',
          carrier: null,
          shippingCostPending: true,
        },
      });

      expect(html).toContain(
        '<td style="padding:4px 8px;text-align:right;color:#64748b;font-style:italic;">уточнить оператор</td>',
      );
      expect(html).toContain('Без доставки — її вартість уточнить оператор, коли зателефонує.');
      expect(html).toContain('<p style="margin:0 0 4px;font-weight:bold;">Інша доставка</p>');
      expect(html).toContain(
        'Вартість доставки уточнить оператор, коли зателефонує підтвердити замовлення. Її додадуть до суми при отриманні.',
      );
      expect(plain(text)).toContain(
        [
          'Доставка: уточнить оператор',
          'Разом: 69,97 ₴',
          'Без доставки — її вартість уточнить оператор, коли зателефонує.',
        ].join('\n'),
      );
      expect(text).toContain(
        [
          'Доставка:',
          'Інша доставка',
          'Олена Коваль',
          'Укрпошта, індекс 88000, вул. Корзо, 5',
          'Ужгород',
          '+380 50 123 4567',
          'Вартість доставки уточнить оператор, коли зателефонує підтвердити замовлення. Її додадуть до суми при отриманні.',
        ].join('\n'),
      );
      // The 0 is a placeholder — it must not be printed as a price anywhere.
      expect(plain(html)).not.toMatch(/>0 ₴|0,00/);
      expect(plain(text)).not.toMatch(/Доставка: 0|0,00/);
      expect(html).not.toContain('Безкоштовно');
    });

    it('a quoted OTHER order (cost > 0) shows the amount and no pending note', () => {
      const { html, text } = render({
        deliveryMethod: 'OTHER',
        shippingCost: '120.00',
        total: '189.97',
        shippingAddress: { ...recipient, address1: 'x', city: 'Львів', shippingCostPending: true },
      });

      expect(plain(text)).toContain('Доставка: 120 ₴');
      expect(text).not.toContain('Без доставки');
      expect(html).not.toContain('Без доставки');
    });

    it('renders a legacy outbox payload (no method, no snapshot fields) without "undefined"', () => {
      // Exactly the shape queued before TASK-643/647: no deliveryMethod anywhere,
      // no np refs, cost 0. Inferred as OTHER — the same rule the TASK-642
      // migration used to backfill the order column.
      const { html, text } = buildOrderConfirmationEmail(baseParams());

      expect(html).not.toContain('undefined');
      expect(text).not.toContain('undefined');
      expect(html).toContain('Інша доставка');
      expect(text).toContain('Доставка: уточнить оператор');
      expect(plain(text)).not.toMatch(/Доставка: 0|0,00/);
    });

    it('infers Nova Poshta for a legacy payload that carries NP refs', () => {
      const { html } = render({
        shippingAddress: {
          ...recipient,
          address1: 'Відділення №3',
          city: 'Київ',
          npCityRef: 'c',
          npWarehouseRef: 'w',
          npWarehouseName: 'Відділення №3',
        },
      });

      expect(html).toContain('<p style="margin:0 0 4px;font-weight:bold;">Нова Пошта</p>');
      expect(html).toContain('>Безкоштовно</td>');
    });

    it('falls back to the snapshot method when the payload has none', () => {
      const { html } = render({
        shippingAddress: { ...recipient, address1: 'x', city: 'Київ', deliveryMethod: 'COURIER' },
      });

      expect(html).toContain('<p style="margin:0 0 4px;font-weight:bold;">Кур\'єр</p>');
    });

    it('escapes every dynamic delivery value (XSS)', () => {
      const evil = '<script>alert(1)</script>';
      const { html } = render({
        deliveryMethod: 'PICKUP',
        shippingAddress: {
          firstName: evil,
          lastName: 'B',
          phone: evil,
          address1: evil,
          city: evil,
          pickupPointName: evil,
          pickupPointAddress: evil,
          pickupPointHours: evil,
          pickupPointPhone: evil,
          pickupPointMapUrl: 'https://maps.example.com/?q="><script>',
        },
      });

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('href="https://maps.example.com/?q=&quot;&gt;&lt;script&gt;"');
    });
  });
});
