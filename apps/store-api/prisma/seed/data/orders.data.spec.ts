import { allowedInKinds } from '../../../src/order/order-money';
import { assertOrderSet, planOrder, type OrderPlan, type PlanContext } from '../lib/order-plan';
import type { OrderSpec } from '../types';
import { deltas, servicesData, templateServiceNames } from './addons.data';
import { cataloguePositions } from './catalogue';
import { rootCategorySlug } from './categories.data';
import { pickupPointsData } from './delivery.data';
import { buildDiscountsData } from './discounts.data';
import { orderSpecs } from './orders.data';

/**
 * TASK-2569 / TASK-2563 / TASK-1821 — every seeded order must be one the shop
 * could have produced. `planOrder` runs the domain's own rules (delivery ×
 * payment matrix, ORDER_TRANSITIONS, assessReceipt / assessPayout / canReverse,
 * the derived payment status); these tests run it over the real data without a
 * database, and check the demo actually covers what it promises to.
 */

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;

/**
 * The add-ons checkout would offer, from the seed data alone: the «Смартфони»
 * template (its subtree inherits it), then the product deltas. The seeder asks
 * the real AddonApplicabilityResolver instead; this is its data-level twin.
 */
function addonPrice(sku: string, name: string): number {
  const position = cataloguePositions().find((p) => p.sku === sku);
  if (!position) throw new Error(`unknown SKU ${sku}`);
  const delta = deltas.find((d) => d.positionSlug === position.slug && d.serviceName === name);
  const templated =
    rootCategorySlug(position.entry.categorySlug) === 'smartphones' &&
    templateServiceNames.includes(name);
  if (delta?.type === 'REMOVE' || (!templated && !delta)) {
    throw new Error(`${name} does not apply to ${sku}`);
  }
  const service = servicesData.find((s) => s.name === name)!;
  return delta?.type === 'OVERRIDE' && delta.price !== undefined ? delta.price : service.price;
}

const ctx: PlanContext = {
  now: NOW,
  priceBySku: new Map(cataloguePositions().map((p) => [p.sku, p.price])),
  addonPrice,
  discounts: new Map(buildDiscountsData().map((d) => [d.code, d])),
  pickupPoints: new Map(pickupPointsData.map((p) => [p.key, p])),
  buyer: (spec) => spec.guest ?? { firstName: 'Ім’я', lastName: 'Прізвище', phone: '380991234567' },
};

const plans: OrderPlan[] = orderSpecs.map((spec) => planOrder(spec, ctx));

describe('seeded orders — reachable through the domain', () => {
  it.each(orderSpecs.map((s) => [s.key, s] as const))('%s plans without a refusal', (_k, spec) => {
    expect(() => planOrder(spec, ctx)).not.toThrow();
  });

  it('respects every promo code limit across the set', () => {
    expect(() => assertOrderSet(orderSpecs, ctx)).not.toThrow();
  });

  it('records each receipt with a kind the delivery admits (allowedInKinds)', () => {
    for (const plan of plans) {
      for (const entry of plan.entries) {
        if (entry.direction !== 'IN' || entry.kind === 'LIQPAY_PAYMENT') continue;
        expect(allowedInKinds(plan.spec.paymentMethod, plan.deliveryMethod)).toContain(entry.kind);
      }
    }
  });

  it('builds a delivery snapshot of the current shape for every method (TASK-1821)', () => {
    for (const plan of plans) {
      const address = plan.shippingAddress;
      expect(address.deliveryMethod).toBe(plan.deliveryMethod);
      expect(address).not.toHaveProperty('warehouse');
      expect(address).not.toHaveProperty('recipient');
      if (plan.deliveryMethod === 'NOVA_POSHTA') {
        expect(address.npCityRef).toMatch(/^[0-9a-f-]{36}$/);
        expect(address.npWarehouseRef).toMatch(/^[0-9a-f-]{36}$/);
      } else {
        expect(address.npCityRef).toBeUndefined();
      }
      if (plan.deliveryMethod === 'PICKUP') expect(address.pickupPointName).toBeTruthy();
      if (plan.deliveryMethod === 'OTHER') expect(address.shippingCostPending).toBe(true);
    }
  });

  it('keeps total = subtotal + shipping + add-ons − discount', () => {
    for (const p of plans) {
      expect(p.totalKop).toBe(p.subtotalKop + p.shippingKop + p.addonsKop - p.discountKop);
    }
  });

  it('stamps restockedAt exactly on the orders cancelled before shipment', () => {
    for (const p of plans) {
      expect(p.restockedAt !== null).toBe(p.status === 'CANCELLED');
    }
  });
});

describe('seeded orders — what the demo covers', () => {
  const kinds = new Set(plans.flatMap((p) => p.entries.map((e) => e.kind)));

  it('uses all four delivery methods and all four payment methods', () => {
    expect(new Set(plans.map((p) => p.deliveryMethod))).toEqual(
      new Set(['NOVA_POSHTA', 'PICKUP', 'COURIER', 'OTHER']),
    );
    expect(new Set(orderSpecs.map((s) => s.paymentMethod))).toEqual(
      new Set(['ON_DELIVERY', 'ONLINE', 'INSTALLMENTS', 'BANK_TRANSFER']),
    );
  });

  it('records money of every receipt kind, a LiqPay success and failure, a refund and a reversal', () => {
    for (const kind of [
      'LIQPAY_PAYMENT',
      'COD_NOVA_POSHTA',
      'PAID_AT_POINT',
      'PAID_TO_COURIER',
      'BANK_TRANSFER',
    ] as const) {
      expect(kinds).toContain(kind);
    }
    expect(plans.some((p) => p.payments.some((x) => x.status === 'FAILED'))).toBe(true);
    expect(plans.some((p) => p.entries.some((e) => e.reversalOfId !== null))).toBe(true);
    expect(
      plans.some((p) => p.status === 'CANCELLED' && p.entries.some((e) => e.direction === 'OUT')),
    ).toBe(true);
  });

  it('has a part payment and an overpayment that carries its reason', () => {
    expect(plans.some((p) => p.paymentStatus === 'PARTIALLY_PAID')).toBe(true);
    const overpaid = plans.filter((p) => {
      const inKop = p.entries.filter((e) => e.direction === 'IN' && !e.reversalOfId);
      return inKop.reduce((s, e) => s + e.amountKop, 0) > p.totalKop;
    });
    expect(overpaid.length).toBeGreaterThan(0);
    for (const p of overpaid) expect(p.entries.some((e) => e.reason)).toBe(true);
  });

  it('has a PENDING order older than 48 h, two orders older than 30 days and a guest', () => {
    const age = (p: OrderPlan) => NOW - p.createdAt.getTime();
    expect(plans.some((p) => p.status === 'PENDING' && age(p) > 48 * HOUR)).toBe(true);
    expect(plans.filter((p) => age(p) > 30 * 24 * HOUR).length).toBeGreaterThanOrEqual(2);
    expect(orderSpecs.some((s) => s.guest)).toBe(true);
  });

  it('sells add-ons on two or three lines', () => {
    const withAddons = plans.flatMap((p) => p.lines).filter((l) => l.addons.length > 0);
    expect(withAddons.length).toBeGreaterThanOrEqual(2);
    expect(withAddons.length).toBeLessThanOrEqual(3);
  });

  it('never seeds a hand-set REFUNDED order (it is derived by returns)', () => {
    expect(plans.some((p) => p.status === 'REFUNDED')).toBe(false);
  });
});

describe('planOrder refuses what the domain refuses', () => {
  const base = orderSpecs.find((s) => s.key === 'john-1')!;
  const refuse = (overrides: Partial<OrderSpec>) =>
    expect(() => planOrder({ ...base, ...overrides }, ctx)).toThrow(/not reachable/);

  it('an online payment for «Інша доставка»', () => {
    refuse({
      delivery: { method: 'OTHER', city: 'Рахів', street: 'вул. Миру, 3' },
      paymentMethod: 'ONLINE',
    });
  });

  it('a bank transfer from the storefront', () => {
    refuse({ paymentMethod: 'BANK_TRANSFER' });
  });

  it('a pickup at a point that is switched off', () => {
    refuse({ delivery: { method: 'PICKUP', point: 'kyiv-podil' } });
  });

  it('a status nobody may set', () => {
    refuse({ status: 'REFUNDED', statusFlow: ['PENDING', 'REFUNDED'] });
  });

  it('a stated payment status the ledger does not derive', () => {
    refuse({ paymentStatus: 'PAID' });
  });

  it('a payout on a live order', () => {
    refuse({
      money: [
        { type: 'receipt', kind: 'COD_NOVA_POSHTA', at: 1 },
        { type: 'payout', kind: 'CASH_REFUND', at: 2, reason: 'x' },
      ],
      paymentStatus: 'PAID',
    });
  });
});
