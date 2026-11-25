import { allowedInKinds } from '../../../src/order/order-money';
import { planCopyPair } from '../lib/order-copy-plan';
import { assertOrderSet, planOrder, type OrderPlan, type PlanContext } from '../lib/order-plan';
import { planReturns } from '../lib/return-plan';
import { copyPairs } from './order-copies.data';
import { returnSpecs } from './returns.data';
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

describe('seeded order copies (TASK-2048)', () => {
  const pairs = copyPairs.map((pair) => ({ pair, plan: planCopyPair(pair, ctx) }));

  it('plans every pair through the domain', () => {
    expect(pairs).toHaveLength(2);
  });

  it('cancels the original with a COPIED_TO_ORDER note and moves its money in a «Залік» pair', () => {
    const { plan } = pairs.find(({ pair }) => pair.cancelOriginal)!;
    const cancel = plan.original.history.find((h) => h.toStatus === 'CANCELLED')!;
    expect(cancel.note).toBe('COPIED_TO_ORDER');
    expect(plan.offsetKop).toBeGreaterThan(0);

    const out = plan.original.entries.find((e) => e.kind === 'OFFSET_TO_ORDER')!;
    const into = plan.copy.entries.find((e) => e.kind === 'OFFSET_FROM_ORDER')!;
    expect(out.amountKop).toBe(plan.offsetKop);
    expect(into.amountKop).toBe(plan.offsetKop);
    expect(out.counterpartOrderId).toBe(plan.copy.id);
    expect(into.counterpartOrderId).toBe(plan.original.id);
    expect(plan.copy.history[0].note).toBe('COPY_OF_ORDER');
  });

  it('marks the original of a copy made without a cancel on a current → current row', () => {
    const { plan } = pairs.find(({ pair }) => !pair.cancelOriginal)!;
    const marker = plan.original.history.find((h) => h.note === 'COPIED_TO_ORDER')!;
    expect(marker.fromStatus).toBe(marker.toStatus);
    expect(plan.offsetKop).toBe(0);
    expect(plan.copy.entries).toEqual([]);
  });

  it('keeps copy keys apart from the plain order keys', () => {
    const keys = new Set(orderSpecs.map((s) => s.key));
    for (const { pair } of pairs) {
      expect(keys.has(pair.original.key)).toBe(false);
      expect(keys.has(pair.copy.key)).toBe(false);
    }
  });
});

describe('seeded returns — every path allowed by the return state machine', () => {
  const plan = planReturns(returnSpecs, new Map(plans.map((p) => [p.spec.key, p])), NOW);
  const byKey = new Map(plan.returns.map((r) => [r.spec.key, r]));

  it('walks every return to the status its spec states', () => {
    expect(plan.returns).toHaveLength(returnSpecs.length);
    for (const ret of plan.returns) expect(ret.status).toBe(ret.spec.status);
  });

  it('covers every status, every decision and every channel', () => {
    expect(new Set(plan.returns.map((r) => r.status))).toEqual(
      new Set(['REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED']),
    );
    expect(new Set(plan.returns.flatMap((r) => r.decisionEvents.map((e) => e.decision)))).toEqual(
      new Set(['REFUND', 'REPLACEMENT', 'REPAIR', 'REJECT']),
    );
    expect(new Set(plan.returns.map((r) => r.channel))).toEqual(
      new Set(['ACCOUNT', 'GUEST_LINK', 'OPERATOR']),
    );
  });

  it('gives a reason to the refusal, the changed decision and the lowered credit', () => {
    const rejected = plan.returns.find((r) => r.decision === 'REJECT')!;
    expect(rejected.decisionReason).toBeTruthy();
    const changed = plan.returns.find((r) => r.decisionEvents.length > 1)!;
    expect(changed.decisionEvents[1].reason).toBeTruthy();
    expect(plan.returns.some((r) => r.creditReason)).toBe(true);
  });

  it('has a repair stopped half-way, one finished, and an UNREPAIRABLE one re-decided', () => {
    const repairs = plan.returns.filter((r) => r.repairEvents.length > 0);
    expect(repairs.some((r) => r.decision === 'REPAIR' && r.repairEvents.length === 2)).toBe(true);
    expect(repairs.some((r) => r.repairEvents.some((e) => e.step === 'HANDED_TO_CUSTOMER'))).toBe(
      true,
    );
    const unrepairable = repairs.find((r) =>
      r.repairEvents.some((e) => e.result === 'UNREPAIRABLE'),
    )!;
    expect(unrepairable.decision).toBe('REFUND');
  });

  it('turns one order REFUNDED through LiqPay and cash payouts, and leaves one PARTIALLY_REFUNDED', () => {
    const refunded = plan.orders.filter((o) => o.status === 'REFUNDED');
    expect(refunded).toHaveLength(1);
    expect(new Set(refunded[0].payouts.map((p) => p.kind))).toEqual(
      new Set(['LIQPAY_REFUND', 'CASH_REFUND']),
    );
    expect(refunded[0].paymentStatus).toBe('REFUNDED');
    expect(plan.orders.some((o) => o.paymentStatus === 'PARTIALLY_REFUNDED')).toBe(true);
  });

  it('restocks exactly the returns received with restock', () => {
    expect(byKey.get('dmytro-1-charger')!.restockedAt).not.toBeNull();
    expect(byKey.get('taras-4-unrepairable')!.restockedAt).toBeNull();
  });
});

describe('seeded promo codes (TASK-2569)', () => {
  const codes = buildDiscountsData();
  const redeemed = (code: string) => plans.filter((p) => p.spec.discountCode === code);
  /** DiscountRepository.findPromoPage: active, on the page, started, not expired. */
  const onPromoPage = codes.filter(
    (d) =>
      d.isActive &&
      d.showOnPromoPage &&
      (!d.startsAt || d.startsAt.getTime() <= NOW) &&
      (!d.expiresAt || NOW < d.expiresAt.getTime()) &&
      (d.maxRedemptions === undefined || redeemed(d.code).length < d.maxRedemptions),
  );

  it('has a code scheduled to start later', () => {
    expect(codes.some((d) => d.isActive && d.startsAt && d.startsAt.getTime() > NOW)).toBe(true);
  });

  it('has a code used up by real redemptions on live account orders', () => {
    const exhausted = codes.find(
      (d) => d.maxRedemptions !== undefined && redeemed(d.code).length === d.maxRedemptions,
    )!;
    expect(exhausted).toBeDefined();
    for (const plan of redeemed(exhausted.code)) {
      expect(plan.spec.email).toBeDefined();
      expect(plan.status).not.toBe('CANCELLED');
    }
  });

  it('lists two or three live codes on the «Акції» page', () => {
    expect(onPromoPage.length).toBeGreaterThanOrEqual(2);
    expect(onPromoPage.length).toBeLessThanOrEqual(3);
  });

  it('redeems the private VIP20, and every redemption carries the order phone', () => {
    expect(redeemed('VIP20').length).toBeGreaterThan(0);
    for (const plan of plans.filter((p) => p.spec.discountCode)) {
      expect(plan.shippingAddress.phone).toMatch(/^380\d{9}$/);
    }
  });
});
