import type {
  DeliveryMethod,
  MoneyDirection,
  MoneyEntryKind,
  OrderHistoryNote,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';
import type { ShippingAddressData } from '../../../src/order/order.types';
import { COURIER_SETTINGS, NP_CITIES, NP_SHIPPING_ESTIMATE } from '../data/delivery.data';
import type { PickupPointSeed } from '../data/delivery.data';
import { statusOffsetHours } from '../data/orders.data';
import type { MoneyEventSpec, OrderSpec, SeedActor } from '../types';
import {
  assessPayout,
  assessReceipt,
  buildDeliverySnapshot,
  canReverse,
  canTransition,
  deriveBalance,
  derivePaymentStatus,
  directionOf,
  flatShippingCost,
  isPaymentAllowedForAdminDelivery,
  isPaymentAllowedForDelivery,
  ledgerTotals,
  pickupPointSnapshot,
  PRE_SHIPMENT_STATUSES,
  toCents,
} from './domain';
import { deterministicUuid } from './ids';

/**
 * The plan of one seeded order (TASK-2569): every row the order seeder writes,
 * derived from an {@link OrderSpec} with the domain's own pure rules, and
 * refused with a readable error when the domain would not have produced it.
 *
 * Pure: no Prisma client, no clock — `now` comes in. The data spec runs it over
 * every spec without a database; the seeder runs it again and writes the result.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A promo code as the discount seeder writes it. */
export interface DiscountRule {
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minSpend?: number;
  maxRedemptions?: number;
  perUserLimit?: number;
  startsAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
}

export interface PlanContext {
  now: number;
  /** UAH by SKU, as the catalogue seeds it. */
  priceBySku: ReadonlyMap<string, number>;
  /** UAH an addon costs on a line — must throw when the addon does not apply to the product. */
  addonPrice: (sku: string, addonName: string) => number;
  discounts: ReadonlyMap<string, DiscountRule>;
  pickupPoints: ReadonlyMap<string, PickupPointSeed>;
  /** The buyer's name and canonical phone — the account's, or the guest's. */
  buyer: (spec: OrderSpec) => { firstName: string; lastName: string; phone: string };
}

export interface PlannedLine {
  id: string;
  sku: string;
  quantity: number;
  priceKop: number;
  createdAt: Date;
  addons: { id: string; name: string; priceKop: number }[];
}

export interface PlannedHistoryRow {
  changeType: 'STATUS' | 'PAYMENT_STATUS';
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  fromPaymentStatus: PaymentStatus | null;
  toPaymentStatus: PaymentStatus | null;
  note: OrderHistoryNote | null;
  actor: SeedActor;
  at: Date;
}

export interface PlannedPayment {
  id: string;
  status: 'SUCCEEDED' | 'FAILED';
  amountKop: number;
  createdAt: Date;
  settledAt: Date | null;
}

export interface PlannedMoneyEntry {
  id: string;
  kind: MoneyEntryKind;
  direction: MoneyDirection;
  amountKop: number;
  paymentId: string | null;
  providerRef: string | null;
  actor: SeedActor;
  reason: string | null;
  reversalOfId: string | null;
  occurredAt: Date;
}

export interface OrderPlan {
  spec: OrderSpec;
  id: string;
  createdAt: Date;
  lines: PlannedLine[];
  subtotalKop: number;
  discountKop: number;
  shippingKop: number;
  addonsKop: number;
  totalKop: number;
  deliveryMethod: DeliveryMethod;
  pickupPointKey: string | null;
  shippingAddress: ShippingAddressData;
  history: PlannedHistoryRow[];
  payments: PlannedPayment[];
  entries: PlannedMoneyEntry[];
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paidAt: Date | null;
  restockedAt: Date | null;
}

/** The id of a seeded order — stable across runs. */
export function orderId(key: string): string {
  return deterministicUuid(`order-${key}`);
}

/** The id of a seeded order line — stable, because return lines point at it (FK Restrict). */
export function orderItemId(key: string, index: number): string {
  return deterministicUuid(`order-item-${key}-${index}`);
}

/** A promo code's amount, in kopecks — `computeAmountCents` (discount.service.ts, not exported). */
export function discountAmountKop(rule: DiscountRule, subtotalKop: number): number {
  const raw =
    rule.type === 'PERCENT'
      ? Math.round((subtotalKop * rule.value) / 100)
      : toCents(String(rule.value));
  return Math.max(0, Math.min(raw, subtotalKop));
}

function fail(spec: { key: string }, message: string): never {
  throw new Error(`Seed order «${spec.key}» is not reachable through the domain: ${message}`);
}

/** The typed address checkout would have sent, then the domain's own snapshot of it. */
function shippingAddressOf(
  spec: OrderSpec,
  ctx: PlanContext,
): { snapshot: ShippingAddressData; pickupPointKey: string | null } {
  const buyer = ctx.buyer(spec);
  const base = { firstName: buyer.firstName, lastName: buyer.lastName, phone: buyer.phone };
  const d = spec.delivery;
  switch (d.method) {
    case 'NOVA_POSHTA': {
      const city = NP_CITIES[d.city];
      const branch = city.branches[d.branch];
      return {
        pickupPointKey: null,
        snapshot: buildDeliverySnapshot(
          {
            ...base,
            city: city.name,
            address1: branch.name,
            country: 'UA',
            npCityRef: city.ref,
            npWarehouseRef: branch.ref,
            npWarehouseName: branch.name,
          },
          'NOVA_POSHTA',
        ),
      };
    }
    case 'PICKUP': {
      const point = ctx.pickupPoints.get(d.point);
      if (!point) fail(spec, `unknown pickup point «${d.point}»`);
      // OrderService.resolvePickupPoint: checkout refuses a point that is switched off.
      if (!point.isActive) fail(spec, `pickup point «${d.point}» is inactive`);
      return {
        pickupPointKey: d.point,
        snapshot: buildDeliverySnapshot(
          { ...base, city: point.city, address1: point.address, country: 'UA' },
          'PICKUP',
          { point: pickupPointSnapshot(point) },
        ),
      };
    }
    case 'COURIER':
      return {
        pickupPointKey: null,
        snapshot: buildDeliverySnapshot(
          { ...base, city: COURIER_SETTINGS.cityName, address1: d.street, country: 'UA' },
          'COURIER',
        ),
      };
    case 'OTHER':
      return {
        pickupPointKey: null,
        snapshot: buildDeliverySnapshot(
          { ...base, city: d.city, address1: d.street, country: 'UA' },
          'OTHER',
          { shippingCostPending: true },
        ),
      };
  }
}

/** When a status was reached, in hours after placement. */
function statusHour(spec: OrderSpec, status: OrderStatus): number {
  return spec.statusAt?.[status] ?? statusOffsetHours[status];
}

function statusActor(spec: OrderSpec, status: OrderStatus, index: number): SeedActor {
  if (index === 0) return spec.byOperator ? 'operator' : 'system';
  if (spec.systemStatuses?.includes(status)) return 'system';
  if (status === 'CANCELLED' && spec.selfCancel) return 'customer';
  return 'operator';
}

/** Money and status events of an order, in the order they happened. */
type TimelineEvent =
  | { at: number; kind: 'status'; index: number }
  | { at: number; kind: 'money'; index: number; event: MoneyEventSpec };

/** Build — and check — the plan of one order. */
export function planOrder(spec: OrderSpec, ctx: PlanContext): OrderPlan {
  // ── Who placed it ─────────────────────────────────────────────────────────
  if (Boolean(spec.email) === Boolean(spec.guest)) {
    fail(spec, 'an order has exactly one of an account (email) and a guest contact');
  }
  if (spec.guest && spec.discountCode) {
    // DiscountRedemption.userId is NOT NULL: a plain guest cannot redeem (TASK-2010).
    fail(spec, 'a guest order cannot carry a promo code');
  }

  // ── Delivery × payment ────────────────────────────────────────────────────
  const method = spec.delivery.method;
  const matrixOk = spec.byOperator
    ? isPaymentAllowedForAdminDelivery(method, spec.paymentMethod)
    : isPaymentAllowedForDelivery(method, spec.paymentMethod);
  if (!matrixOk) {
    fail(spec, `${method} cannot be paid ${spec.paymentMethod} (delivery-payment-matrix.ts)`);
  }

  // ── Statuses ──────────────────────────────────────────────────────────────
  const flow = spec.statusFlow;
  if (flow[0] !== 'PENDING') fail(spec, 'every order is born PENDING');
  for (let i = 1; i < flow.length; i++) {
    if (!canTransition(flow[i - 1], flow[i])) {
      fail(spec, `${flow[i - 1]} → ${flow[i]} is not in ORDER_TRANSITIONS`);
    }
    if (statusHour(spec, flow[i]) < statusHour(spec, flow[i - 1])) {
      fail(spec, `${flow[i]} is dated before ${flow[i - 1]}`);
    }
  }
  if (flow[flow.length - 1] !== spec.status) {
    fail(spec, `statusFlow ends in ${flow[flow.length - 1]}, not ${spec.status}`);
  }
  if (spec.selfCancel) {
    const at = flow.indexOf('CANCELLED');
    // A customer may cancel only from PENDING.
    if (at !== 1) fail(spec, 'a customer cancels only from PENDING');
  }
  if (spec.refundedByReturns && !['SHIPPED', 'DELIVERED'].includes(spec.status)) {
    fail(spec, 'only a SHIPPED/DELIVERED order becomes REFUNDED through its returns');
  }

  // ── Lines and money columns ───────────────────────────────────────────────
  const id = orderId(spec.key);
  const createdAt = new Date(ctx.now - spec.daysAgo * DAY);
  const at = (hours: number) => new Date(createdAt.getTime() + hours * HOUR);

  const lines: PlannedLine[] = spec.items.map((item, index) => {
    const price = ctx.priceBySku.get(item.sku);
    if (price === undefined) fail(spec, `unknown SKU ${item.sku}`);
    const lineId = orderItemId(spec.key, index);
    return {
      id: lineId,
      sku: item.sku,
      quantity: item.quantity,
      priceKop: toCents(String(price)),
      // (createdAt, id) is the order the return credit splits a discount in.
      createdAt: new Date(createdAt.getTime() + index),
      addons: (item.addons ?? []).map((name) => ({
        id: deterministicUuid(`order-item-addon-${spec.key}-${index}-${name}`),
        name,
        priceKop: toCents(String(ctx.addonPrice(item.sku, name))),
      })),
    };
  });
  const subtotalKop = lines.reduce((sum, l) => sum + l.priceKop * l.quantity, 0);
  const addonsKop = lines.reduce((sum, l) => sum + l.addons.reduce((s, a) => s + a.priceKop, 0), 0);

  let discountKop = 0;
  if (spec.discountCode) {
    const rule = ctx.discounts.get(spec.discountCode);
    if (!rule) fail(spec, `unknown promo code ${spec.discountCode}`);
    const placed = createdAt.getTime();
    if (!rule.isActive) fail(spec, `${rule.code} is inactive`);
    if (rule.startsAt && placed < rule.startsAt.getTime()) fail(spec, `${rule.code} not started`);
    if (rule.expiresAt && placed > rule.expiresAt.getTime()) fail(spec, `${rule.code} expired`);
    if (rule.minSpend !== undefined && subtotalKop < toCents(String(rule.minSpend))) {
      fail(spec, `${rule.code} needs a subtotal of ${rule.minSpend}`);
    }
    discountKop = discountAmountKop(rule, subtotalKop);
  }

  const shippingKop =
    method === 'NOVA_POSHTA'
      ? toCents(String(NP_SHIPPING_ESTIMATE))
      : toCents(
          flatShippingCost(method, {
            subtotal: (subtotalKop / 100).toFixed(2),
            courierPrice: String(COURIER_SETTINGS.price),
            courierFreeFrom: String(COURIER_SETTINGS.freeFrom),
          }),
        );
  const totalKop = subtotalKop + shippingKop + addonsKop - discountKop;

  const { snapshot, pickupPointKey } = shippingAddressOf(spec, ctx);

  // ── Timeline: statuses and money, checked event by event ──────────────────
  const events: TimelineEvent[] = [
    ...flow.map((s, index) => ({ at: statusHour(spec, s), kind: 'status' as const, index })),
    ...(spec.money ?? []).map((event, index) => ({
      at: event.at,
      kind: 'money' as const,
      index,
      event,
    })),
  ];
  // Stable sort; on a tie money comes first — a LiqPay success is what moves the
  // order to CONFIRMED.
  events.sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === 'money' ? -1 : 1));

  const history: PlannedHistoryRow[] = [];
  const payments: PlannedPayment[] = [];
  const entries: PlannedMoneyEntry[] = [];
  const entryByEvent = new Map<number, PlannedMoneyEntry>();
  const reversed = new Set<string>();
  let status: OrderStatus = 'PENDING';
  let paymentStatus: PaymentStatus = 'PENDING';
  let lastAttemptFailed = false;
  let paidAt: Date | null = null;
  let restockedAt: Date | null = null;

  const totals = () => ledgerTotals(entries.map((e) => ({ ...e, voidedAt: null })));
  const balance = () => {
    const { paidKop, refundedKop } = totals();
    return deriveBalance({
      totalKop,
      returnCreditKop: 0,
      paidKop,
      refundedKop,
      orderStatus: status,
    });
  };
  const rederive = (actor: SeedActor, when: Date) => {
    const { paidKop, refundedKop } = totals();
    const next = derivePaymentStatus({ totalKop, paidKop, refundedKop, lastAttemptFailed });
    if (next !== paymentStatus) {
      history.push({
        changeType: 'PAYMENT_STATUS',
        fromStatus: null,
        toStatus: null,
        fromPaymentStatus: paymentStatus,
        toPaymentStatus: next,
        note: null,
        actor,
        at: when,
      });
      paymentStatus = next;
    }
  };
  const addEntry = (
    index: number,
    kind: MoneyEntryKind,
    amountKop: number,
    extra: Partial<PlannedMoneyEntry> & { actor: SeedActor; occurredAt: Date },
  ) => {
    const entry: PlannedMoneyEntry = {
      id: deterministicUuid(`money-${spec.key}-${index}`),
      kind,
      direction: directionOf(kind),
      amountKop,
      paymentId: null,
      providerRef: null,
      reason: null,
      reversalOfId: null,
      ...extra,
    };
    entries.push(entry);
    entryByEvent.set(index, entry);
  };

  for (const event of events) {
    const when = at(event.at);
    if (when.getTime() > ctx.now) fail(spec, `an event is dated in the future (+${event.at} h)`);

    if (event.kind === 'status') {
      const to = flow[event.index];
      const from = event.index === 0 ? null : flow[event.index - 1];
      if (from !== null && from !== status) fail(spec, 'status timeline out of order');
      // An ONLINE order shipped with no money in is flagged SHIPPED_UNPAID — not demo data.
      if (
        to === 'SHIPPED' &&
        (spec.paymentMethod === 'ONLINE' || spec.paymentMethod === 'INSTALLMENTS') &&
        totals().paidKop <= 0
      ) {
        fail(spec, 'an online order is shipped only once paid');
      }
      history.push({
        changeType: 'STATUS',
        fromStatus: from,
        toStatus: to,
        fromPaymentStatus: null,
        toPaymentStatus: null,
        note: null,
        actor: statusActor(spec, to, event.index),
        at: when,
      });
      // A cancel before shipment returns the stock and stamps restockedAt.
      if (to === 'CANCELLED' && from !== null && PRE_SHIPMENT_STATUSES.has(from)) {
        restockedAt = when;
      }
      status = to;
      continue;
    }

    const m = event.event;
    switch (m.type) {
      case 'liqpay': {
        if (spec.paymentMethod !== 'ONLINE' && spec.paymentMethod !== 'INSTALLMENTS') {
          fail(spec, `a LiqPay attempt on a ${spec.paymentMethod} order`);
        }
        if (status !== 'PENDING')
          fail(spec, 'the LiqPay attempt happens while the order is PENDING');
        const paymentId = deterministicUuid(`payment-${spec.key}-${event.index}`);
        payments.push({
          id: paymentId,
          status: m.outcome,
          amountKop: totalKop,
          createdAt: new Date(createdAt.getTime() + 60 * 1000),
          settledAt: m.outcome === 'SUCCEEDED' ? when : null,
        });
        if (m.outcome === 'SUCCEEDED') {
          addEntry(event.index, 'LIQPAY_PAYMENT', totalKop, {
            paymentId,
            providerRef: 'success',
            actor: 'system',
            occurredAt: when,
          });
          paidAt = paidAt ?? when;
          lastAttemptFailed = false;
        } else {
          lastAttemptFailed = true;
        }
        rederive('system', when);
        break;
      }
      case 'receipt': {
        const amountKop = m.amount === undefined ? balance() : toCents(String(m.amount));
        const verdict = assessReceipt({
          kind: m.kind,
          amountKop,
          reason: m.reason ?? null,
          paymentMethod: spec.paymentMethod,
          deliveryMethod: method,
          balanceKop: balance(),
        });
        if (!verdict.ok) fail(spec, `receipt ${m.kind} refused: ${verdict.refusal}`);
        if (amountKop <= 0) fail(spec, `receipt ${m.kind} of nothing`);
        addEntry(event.index, m.kind, amountKop, {
          actor: 'operator',
          reason: m.reason ?? null,
          occurredAt: when,
        });
        rederive('operator', when);
        break;
      }
      case 'payout': {
        const { paidKop, refundedKop } = totals();
        const amountKop =
          m.amount === undefined ? paidKop - refundedKop : toCents(String(m.amount));
        const verdict = assessPayout(
          {
            orderStatus: status,
            paidKop,
            refundedKop,
            balanceKop: balance(),
            outstandingReturnCreditKop: 0,
          },
          amountKop,
        );
        if (!verdict.ok) fail(spec, `payout ${m.kind} refused: ${verdict.refusal}`);
        addEntry(event.index, m.kind, amountKop, {
          actor: 'operator',
          reason: m.reason,
          occurredAt: when,
        });
        rederive('operator', when);
        break;
      }
      case 'reversal': {
        const original = entryByEvent.get(m.of);
        if (!original) fail(spec, `reversal of money event ${m.of}, which has no entry yet`);
        const verdict = canReverse({
          ...original,
          voidedAt: null,
          reversed: reversed.has(original.id),
        });
        if (!verdict.ok) fail(spec, `reversal refused: ${verdict.reason}`);
        const { paidKop, refundedKop } = totals();
        if (original.direction === 'IN' && paidKop - original.amountKop < refundedKop) {
          fail(spec, 'a receipt the payouts depend on cannot be reversed');
        }
        reversed.add(original.id);
        addEntry(event.index, original.kind, original.amountKop, {
          actor: 'operator',
          reason: m.reason,
          reversalOfId: original.id,
          occurredAt: when,
        });
        rederive('operator', when);
        break;
      }
    }
  }

  // ── What must hold at the end ─────────────────────────────────────────────
  if (paymentStatus !== spec.paymentStatus) {
    fail(spec, `the money above derives ${paymentStatus}, the spec says ${spec.paymentStatus}`);
  }
  const live = ['PENDING', 'CONFIRMED', 'PROCESSING'].includes(status);
  if (
    live &&
    (spec.paymentMethod === 'ONLINE' || spec.paymentMethod === 'INSTALLMENTS') &&
    totals().paidKop <= 0
  ) {
    // The 30-minute reservation would have lapsed and the reconcile worker cancelled it.
    fail(spec, 'an unpaid card order cannot still be live — its reservation has expired');
  }
  if (status === 'CANCELLED' && spec.discountCode) {
    // Cancelling releases the redemption (order.repository.ts).
    fail(spec, 'a cancelled order holds no promo-code redemption');
  }

  return {
    spec,
    id,
    createdAt,
    lines,
    subtotalKop,
    discountKop,
    shippingKop,
    addonsKop,
    totalKop,
    deliveryMethod: method,
    pickupPointKey,
    shippingAddress: snapshot,
    history,
    payments,
    entries,
    status,
    paymentStatus,
    paidAt,
    restockedAt,
  };
}

/**
 * Checks that span orders: per-customer and total limits of every promo code,
 * and unique keys. Throws on the first breach.
 */
export function assertOrderSet(specs: readonly OrderSpec[], ctx: PlanContext): void {
  const keys = new Set<string>();
  const byCode = new Map<string, OrderSpec[]>();
  for (const spec of specs) {
    if (keys.has(spec.key)) fail(spec, 'duplicate order key');
    keys.add(spec.key);
    if (spec.discountCode) {
      byCode.set(spec.discountCode, [...(byCode.get(spec.discountCode) ?? []), spec]);
    }
  }
  for (const [code, users] of byCode) {
    const rule = ctx.discounts.get(code);
    if (!rule) continue;
    if (rule.maxRedemptions !== undefined && users.length > rule.maxRedemptions) {
      fail(
        users[0],
        `${code} is redeemed ${users.length} times, above its limit ${rule.maxRedemptions}`,
      );
    }
    if (rule.perUserLimit !== undefined) {
      const perUser = new Map<string, number>();
      for (const s of users) perUser.set(s.email!, (perUser.get(s.email!) ?? 0) + 1);
      for (const [email, n] of perUser) {
        if (n > rule.perUserLimit) fail(users[0], `${email} redeems ${code} ${n} times`);
      }
    }
  }
}
