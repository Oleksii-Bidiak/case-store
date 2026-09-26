import {
  buildOrderPaymentExpiredEmail,
  type OrderPaymentExpiredParams,
} from './order-payment-expired.template';

const baseParams = (
  overrides: Partial<OrderPaymentExpiredParams> = {},
): OrderPaymentExpiredParams => ({
  customerName: 'Олена',
  order: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    items: [
      { name: 'Чохол <iPhone 15>', quantity: 2, url: 'https://shop.test/products/case' },
      { name: 'Захисне скло', quantity: 1 },
    ],
  },
  reorderUrl: 'https://shop.test/catalog',
  ...overrides,
});

const hasHtmlTags = (s: string): boolean => /<[a-z][\s\S]*>/i.test(s);

/**
 * TASK-352 (b), decision B-11 №2: ONE letter after the reservation lapsed —
 * «оплату не отримано, замовлення скасовано, товар повернуто в продаж» — with a
 * way back to buy again. No reminder before the deadline.
 */
describe('buildOrderPaymentExpiredEmail', () => {
  it('names the order in the subject and says it was cancelled', () => {
    const { subject } = buildOrderPaymentExpiredEmail(baseParams());

    expect(subject).toContain('550E8400');
    expect(subject).toContain('скасовано');
  });

  it('says the three facts: no payment, cancelled, goods back on sale', () => {
    const { html, text } = buildOrderPaymentExpiredEmail(baseParams());

    for (const body of [html, text]) {
      expect(body).toContain('Оплату не отримано');
      expect(body).toContain('скасовано');
      expect(body).toContain('повернуто в продаж');
    }
  });

  it('offers to order again with a button', () => {
    const { html, text } = buildOrderPaymentExpiredEmail(baseParams());

    expect(html).toContain('href="https://shop.test/catalog"');
    expect(html).toContain('Оформити знову');
    expect(text).toContain('Оформити знову: https://shop.test/catalog');
  });

  it('lists what was in the order, linking the items it can', () => {
    const { html, text } = buildOrderPaymentExpiredEmail(baseParams());

    expect(html).toContain('href="https://shop.test/products/case"');
    expect(html).toContain('Захисне скло');
    expect(text).toContain('Захисне скло × 1');
  });

  it('escapes item names in the HTML', () => {
    const { html } = buildOrderPaymentExpiredEmail(baseParams());

    expect(html).toContain('Чохол &lt;iPhone 15&gt;');
    expect(html).not.toContain('<iPhone 15>');
  });

  it('drops the button when the storefront address is unknown', () => {
    const { html, text } = buildOrderPaymentExpiredEmail(baseParams({ reorderUrl: undefined }));

    expect(html).not.toContain('Оформити знову');
    expect(text).not.toContain('Оформити знову');
  });

  it('keeps the plain-text body free of markup', () => {
    const params = baseParams({
      order: { id: '550e8400-e29b-41d4-a716-446655440000', items: [{ name: 'Скло', quantity: 1 }] },
    });
    expect(hasHtmlTags(buildOrderPaymentExpiredEmail(params).text)).toBe(false);
  });
});
