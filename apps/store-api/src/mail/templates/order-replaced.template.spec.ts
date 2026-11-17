import { buildOrderReplacedEmail, type OrderReplacedParams } from './order-replaced.template';

const baseParams = (overrides: Partial<OrderReplacedParams> = {}): OrderReplacedParams => ({
  customerName: 'Олена <script>',
  oldOrderId: '550e8400-e29b-41d4-a716-446655440000',
  newOrderId: '7c1e9a42-0000-4000-8000-000000000001',
  orderStatusUrl: 'https://shop.test/orders/guest/abc?x=1&y=2',
  ...overrides,
});

const hasHtmlTags = (s: string): boolean => /<[a-z][\s\S]*>/i.test(s);

/**
 * TASK-2048: «Створити копію» replaced the customer's order with a copy — the
 * letter names both numbers so the buyer knows which one to follow.
 */
describe('buildOrderReplacedEmail', () => {
  it('names the old and the new number in the subject', () => {
    const { subject } = buildOrderReplacedEmail(baseParams());

    expect(subject).toBe('Замовлення #550E8400 замінено на #7C1E9A42');
  });

  it('says it in both bodies, with the new order as the one to follow', () => {
    const { html, text } = buildOrderReplacedEmail(baseParams());

    for (const body of [html, text]) {
      expect(body).toContain('#550E8400');
      expect(body).toContain('#7C1E9A42');
      expect(body).toContain('замінено');
    }
  });

  it('escapes the name and the link in HTML, never in the plain text', () => {
    const { html, text } = buildOrderReplacedEmail(baseParams());

    expect(html).toContain('Олена &lt;script&gt;');
    expect(html).toContain('href="https://shop.test/orders/guest/abc?x=1&amp;y=2"');
    expect(text).toContain('Олена <script>');
    expect(text).toContain('https://shop.test/orders/guest/abc?x=1&y=2');
    expect(hasHtmlTags(text.replace('<script>', ''))).toBe(false);
  });

  it('has no button and no link line without a status link', () => {
    const { html, text } = buildOrderReplacedEmail(baseParams({ orderStatusUrl: undefined }));

    expect(html).not.toContain('<a ');
    expect(text).not.toContain('http');
  });

  it('greets without a name when none is known', () => {
    const { text } = buildOrderReplacedEmail(baseParams({ customerName: undefined }));

    expect(text.split('\n')[0]).toBe('Ваше замовлення замінено');
  });
});
