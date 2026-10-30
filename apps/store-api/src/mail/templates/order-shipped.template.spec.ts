import {
  buildOrderShippedEmail,
  novaPoshtaTrackingUrl,
  type OrderShippedParams,
} from './order-shipped.template';

const WAYBILL = '20450000000001';

const baseParams = (overrides: Partial<OrderShippedParams['order']> = {}): OrderShippedParams => ({
  customerName: 'Олена',
  order: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    trackingNumber: WAYBILL,
    ...overrides,
  },
  orderStatusUrl: 'https://shop.test/orders/status',
});

/**
 * TASK-1987: NP's public page no longer fills in the query-parameter form; the number
 * has to be the path segment, digits only.
 */
describe('novaPoshtaTrackingUrl', () => {
  it('puts the waybill in the path', () => {
    expect(novaPoshtaTrackingUrl(WAYBILL)).toBe('https://novaposhta.ua/tracking/20450000000001');
  });

  it('keeps digits only, so an operator-typed number cannot leave the path', () => {
    expect(novaPoshtaTrackingUrl(' 2045 0000/../0000 01?x#y ')).toBe(
      'https://novaposhta.ua/tracking/20450000000001',
    );
  });

  it.each([['ТТН уточнюється'], ['<x>&"'], ['']])('gives no link for %p', (raw) => {
    expect(novaPoshtaTrackingUrl(raw)).toBeNull();
  });
});

describe('buildOrderShippedEmail', () => {
  it('names the order in the subject', () => {
    expect(buildOrderShippedEmail(baseParams()).subject).toBe('Замовлення #550E8400 відправлено');
  });

  it('links the waybill to NP tracking in both the HTML and the text part', () => {
    const { html, text } = buildOrderShippedEmail(baseParams());

    expect(html).toContain('<strong>20450000000001</strong>');
    expect(html).toContain('href="https://novaposhta.ua/tracking/20450000000001"');
    expect(text).toContain('Номер накладної: 20450000000001');
    expect(text).toContain('Відстежити: https://novaposhta.ua/tracking/20450000000001');
  });

  it('normalises a pasted waybill to digits in the link but shows it as typed', () => {
    const { html, text } = buildOrderShippedEmail(
      baseParams({ trackingNumber: '2045 0000 0000 01' }),
    );

    expect(html).toContain('<strong>2045 0000 0000 01</strong>');
    expect(html).toContain('href="https://novaposhta.ua/tracking/20450000000001"');
    expect(text).toContain('Відстежити: https://novaposhta.ua/tracking/20450000000001');
  });

  it('shows a digit-less waybill but offers no tracking link for it', () => {
    const { html, text } = buildOrderShippedEmail(
      baseParams({ trackingNumber: 'ТТН уточнюється' }),
    );

    expect(html).toContain('<strong>ТТН уточнюється</strong>');
    expect(text).toContain('Номер накладної: ТТН уточнюється');
    for (const body of [html, text]) {
      expect(body).not.toContain('novaposhta.ua');
      expect(body).not.toContain('Відстежити');
    }
  });

  it('has no waybill block at all before the number is entered', () => {
    const { html, text } = buildOrderShippedEmail(baseParams({ trackingNumber: null }));

    for (const body of [html, text]) {
      expect(body).not.toContain('Номер накладної');
      expect(body).not.toContain('novaposhta.ua');
    }
    expect(text).toContain('Переглянути замовлення: https://shop.test/orders/status');
  });

  it('never builds the retired query-parameter link', () => {
    const { html, text } = buildOrderShippedEmail(baseParams());

    expect(html).not.toContain('novaposhta.ua/tracking/?');
    expect(text).not.toContain('novaposhta.ua/tracking/?');
  });
});
