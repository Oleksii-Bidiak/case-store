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
        variantName: 'Black / iPhone 15 Pro',
        quantity: 2,
        price: '29.99',
        lineTotal: '59.98',
      },
      {
        productName: 'Screen Protector',
        variantName: null,
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
      expect(html).toContain('59.98');
      expect(html).toContain('9.99');
      // quantities
      expect(html).toMatch(/\b2\b/);
      expect(html).toMatch(/\b1\b/);
    });

    it('contains the grand total', () => {
      const { html } = buildOrderConfirmationEmail(baseParams());
      expect(html).toContain('69.97');
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
      expect(text).toContain('59.98');
      expect(text).toContain('69.97');
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
      expect(html).toContain('69.97');
      expect(text).toContain('69.97');
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
});
