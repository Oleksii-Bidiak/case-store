import type {
  OrderStatus,
  PaymentAttemptStatus,
  PaymentStatus,
  RepairResult,
  ReturnChannel,
  ReturnDecision,
  ReturnOutcome,
  ReturnRepairStep,
  ReturnStatus,
} from '@prisma/client';
import type { ReturnSpec } from '../data/returns.data';
import type { SeedActor } from '../types';
import {
  assessCreditChange,
  assessPayout,
  attemptStatusAfterRefunds,
  canTransitionReturn,
  decisionPermitsTransition,
  DERIVED_REFUNDED_FROM,
  deriveBalance,
  deriveOrderStatus,
  derivePaymentStatus,
  ledgerTotals,
  nextRepairStep,
  outstandingReturnCreditKop,
  providerRefundAvailableKop,
  repairAcceptsSteps,
  repairStepRequiresResult,
  RESTOCK_ON_STATUS,
  returnCreditFor,
  returnStatusAfterDecision,
  returnStatusAfterPayouts,
  toCents,
} from './domain';
import { deterministicUuid } from './ids';
import type { OrderPlan, PlannedHistoryRow, PlannedMoneyEntry } from './order-plan';

/**
 * The plan of the seeded returns (TASK-2569): each return walked event by event
 * through the return state machine (`return-state-machine.ts`) and the money
 * rules (`order-money.ts`) exactly in the order the operator's screens would
 * have recorded them, with the order's money and status re-derived after every
 * payout. Pure — the data spec runs it without a database.
 */

const HOUR = 60 * 60 * 1000;

export interface PlannedReturn {
  id: string;
  spec: ReturnSpec;
  orderId: string;
  status: ReturnStatus;
  channel: ReturnChannel;
  requestedOutcome: ReturnOutcome | null;
  reason: string;
  operatorNotes: string | null;
  requestedAt: Date;
  resolvedAt: Date | null;
  restockedAt: Date | null;
  createdBy: SeedActor | null;
  decision: ReturnDecision | null;
  decisionReason: string | null;
  decidedAt: Date | null;
  decidedBy: SeedActor | null;
  creditKop: number | null;
  creditReason: string | null;
  items: { id: string; orderItemId: string; quantity: number; createdAt: Date }[];
  decisionEvents: {
    id: string;
    decision: ReturnDecision;
    reason: string | null;
    actor: SeedActor;
    at: Date;
  }[];
  repairEvents: {
    id: string;
    step: ReturnRepairStep;
    result: RepairResult | null;
    destination: string | null;
    ttn: string | null;
    note: string | null;
    actor: SeedActor;
    at: Date;
  }[];
}

/** A payout row, with what a LiqPay refund carries on top of a ledger entry. */
export interface PlannedPayout extends PlannedMoneyEntry {
  returnId: string;
  providerState: 'CONFIRMED' | null;
}

/** What the returns do to one order. */
export interface ReturnOrderOutcome {
  order: OrderPlan;
  payouts: PlannedPayout[];
  /** Rows appended to the order's history (payment status, the derived REFUNDED). */
  history: PlannedHistoryRow[];
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  /** LiqPay attempts whose own status the refunds moved. */
  attempts: { paymentId: string; status: PaymentAttemptStatus }[];
}

export interface ReturnsPlan {
  returns: PlannedReturn[];
  orders: ReturnOrderOutcome[];
}

function fail(spec: { key: string }, message: string): never {
  throw new Error(`Seed return «${spec.key}» is not reachable through the domain: ${message}`);
}

type ReturnEvent =
  | { kind: 'request' }
  | { kind: 'decision'; index: number }
  | { kind: 'repair'; index: number }
  | { kind: 'received' }
  | { kind: 'credit' }
  | { kind: 'payout'; index: number };

/** Who acts for the shop, and who files the request through each door. */
function requester(spec: ReturnSpec): SeedActor | null {
  if (spec.channel === 'ACCOUNT') return 'customer';
  if (spec.channel === 'OPERATOR') return spec.operator ?? 'operator';
  return null; // GUEST_LINK: there is no account behind it
}

export function planReturns(
  specs: readonly ReturnSpec[],
  orders: ReadonlyMap<string, OrderPlan>,
  now: number,
): ReturnsPlan {
  const keys = new Set<string>();
  for (const spec of specs) {
    if (keys.has(spec.key)) fail(spec, 'duplicate return key');
    keys.add(spec.key);
  }

  const byOrder = new Map<string, ReturnSpec[]>();
  for (const spec of specs) {
    byOrder.set(spec.order, [...(byOrder.get(spec.order) ?? []), spec]);
  }

  const returns: PlannedReturn[] = [];
  const outcomes: ReturnOrderOutcome[] = [];

  for (const [orderKey, orderSpecs] of byOrder) {
    const order = orders.get(orderKey);
    if (!order) fail(orderSpecs[0], `unknown order «${orderKey}»`);
    const at = (hours: number) => new Date(order.createdAt.getTime() + hours * HOUR);

    // The order must have travelled: only SHIPPED/DELIVERED orders take returns
    // (RETURNABLE_ORDER_STATUSES in return.service.ts is exactly this set).
    if (!DERIVED_REFUNDED_FROM.includes(order.status)) {
      fail(orderSpecs[0], `order «${orderKey}» is ${order.status}, not shipped or delivered`);
    }
    const travelled = order.history.find(
      (h) => h.changeType === 'STATUS' && DERIVED_REFUNDED_FROM.includes(h.toStatus!),
    )!;

    // ── Per-return state ─────────────────────────────────────────────────────
    const state = new Map<string, PlannedReturn>();
    const timeline: { at: number; spec: ReturnSpec; event: ReturnEvent }[] = [];
    for (const spec of orderSpecs) {
      if (spec.channel === 'GUEST_LINK' && !order.spec.guest) {
        fail(spec, 'the guest link exists only on a guest order');
      }
      if (spec.channel === 'ACCOUNT' && !order.spec.email) {
        fail(spec, 'a guest order has no account to file from');
      }
      if (at(spec.requestedAt) < travelled.at) fail(spec, 'requested before the order travelled');
      const id = deterministicUuid(`return-${spec.key}`);
      state.set(spec.key, {
        id,
        spec,
        orderId: order.id,
        status: 'REQUESTED',
        channel: spec.channel,
        requestedOutcome: spec.requestedOutcome ?? null,
        reason: spec.reason,
        operatorNotes: spec.operatorNotes ?? null,
        requestedAt: at(spec.requestedAt),
        resolvedAt: null,
        restockedAt: null,
        createdBy: requester(spec),
        decision: null,
        decisionReason: null,
        decidedAt: null,
        decidedBy: null,
        creditKop: null,
        creditReason: null,
        items: spec.items.map((item, index) => {
          const line = order.lines[item.line];
          if (!line) fail(spec, `the order has no line ${item.line}`);
          if (item.quantity <= 0) fail(spec, 'a return line returns at least one unit');
          return {
            id: deterministicUuid(`return-item-${spec.key}-${index}`),
            orderItemId: line.id,
            quantity: item.quantity,
            createdAt: at(spec.requestedAt),
          };
        }),
        decisionEvents: [],
        repairEvents: [],
      });
      timeline.push({ at: spec.requestedAt, spec, event: { kind: 'request' } });
      spec.decisions?.forEach((d, index) =>
        timeline.push({ at: d.at, spec, event: { kind: 'decision', index } }),
      );
      spec.repair?.forEach((r, index) =>
        timeline.push({ at: r.at, spec, event: { kind: 'repair', index } }),
      );
      if (spec.received) timeline.push({ at: spec.received.at, spec, event: { kind: 'received' } });
      if (spec.credit) timeline.push({ at: spec.credit.at, spec, event: { kind: 'credit' } });
      spec.payouts?.forEach((p, index) =>
        timeline.push({ at: p.at, spec, event: { kind: 'payout', index } }),
      );
    }
    timeline.sort((a, b) => a.at - b.at);

    // ── Order state the returns move ─────────────────────────────────────────
    const entries: Array<PlannedMoneyEntry & { returnId?: string }> = [...order.entries];
    const payouts: PlannedPayout[] = [];
    const history: PlannedHistoryRow[] = [];
    let orderStatus = order.status;
    let paymentStatus = order.paymentStatus;

    const lines = order.lines.map((l) => ({
      id: l.id,
      quantity: l.quantity,
      grossKop: l.priceKop * l.quantity,
    }));
    const totals = () => ledgerTotals(entries.map((e) => ({ ...e, voidedAt: null })));
    const paidOut = (ret: PlannedReturn) =>
      ledgerTotals(
        payouts.filter((p) => p.returnId === ret.id).map((p) => ({ ...p, voidedAt: null })),
      ).refundedKop;
    const all = () => [...state.values()];
    const creditSum = () => all().reduce((sum, r) => sum + (r.creditKop ?? 0), 0);
    const computeCredit = (ret: PlannedReturn) => {
      // ReturnRepository.computeCredit: other returns' units already credited.
      const creditedBefore = new Map<string, number>();
      for (const other of all()) {
        if (other.id === ret.id || other.creditKop === null) continue;
        for (const item of other.items) {
          creditedBefore.set(
            item.orderItemId,
            (creditedBefore.get(item.orderItemId) ?? 0) + item.quantity,
          );
        }
      }
      return returnCreditFor({
        lines,
        discountKop: order.discountKop,
        items: ret.items,
        creditedBefore,
      });
    };
    const claimed = (except: PlannedReturn) => {
      // Units still spoken for by the order's OTHER live (non-rejected) returns.
      const units = new Map<string, number>();
      for (const other of all()) {
        if (other.id === except.id || other.status === 'REJECTED') continue;
        // Not filed yet at the moment this one is.
        if (other.requestedAt > except.requestedAt) continue;
        for (const item of other.items) {
          units.set(item.orderItemId, (units.get(item.orderItemId) ?? 0) + item.quantity);
        }
      }
      return units;
    };

    for (const { at: hours, spec, event } of timeline) {
      const when = at(hours);
      if (when.getTime() > now) fail(spec, `an event is dated in the future (+${hours} h)`);
      const ret = state.get(spec.key)!;
      const shop: SeedActor = spec.operator ?? 'operator';

      switch (event.kind) {
        case 'request': {
          // Σ units on live returns ≤ what was bought, per line.
          const taken = claimed(ret);
          for (const item of ret.items) {
            const line = order.lines.find((l) => l.id === item.orderItemId)!;
            if ((taken.get(item.orderItemId) ?? 0) + item.quantity > line.quantity) {
              fail(spec, `more units of ${line.sku} than were bought`);
            }
          }
          break;
        }
        case 'decision': {
          const d = spec.decisions![event.index];
          if (ret.status === 'REFUNDED') fail(spec, 'nothing is decided on a refunded return');
          const reason = d.reason ?? null;
          // A refusal, and any change of a decision already made, need a reason.
          if ((d.decision === 'REJECT' || ret.decision !== null) && reason === null) {
            fail(spec, `deciding ${d.decision} needs a reason here`);
          }
          if (d.decision === ret.decision && reason === ret.decisionReason) {
            fail(spec, 'an identical decision is refused');
          }
          const next = returnStatusAfterDecision(ret.status, d.decision);
          if (next === null) fail(spec, `${d.decision} cannot be decided on ${ret.status}`);
          const wasRefund = ret.decision === 'REFUND';
          const isRefund = d.decision === 'REFUND';
          if (wasRefund && !isRefund && d.decision !== 'REJECT' && paidOut(ret) > 0) {
            fail(spec, 'money already went out on this return');
          }
          ret.status = next;
          ret.decision = d.decision;
          ret.decisionReason = reason;
          ret.decidedAt = when;
          ret.decidedBy = shop;
          ret.resolvedAt = when;
          if (isRefund && !wasRefund) {
            ret.creditKop = computeCredit(ret);
            ret.creditReason = null;
          } else if (!isRefund && wasRefund) {
            ret.creditKop = null;
            ret.creditReason = null;
          }
          ret.decisionEvents.push({
            id: deterministicUuid(`return-decision-${spec.key}-${event.index}`),
            decision: d.decision,
            reason,
            actor: shop,
            at: when,
          });
          break;
        }
        case 'repair': {
          const r = spec.repair![event.index];
          if (!repairAcceptsSteps(ret.status, ret.decision)) {
            fail(spec, `repair steps need an open REPAIR decision (is ${ret.decision})`);
          }
          const expected = nextRepairStep(ret.repairEvents.map((e) => e.step));
          if (r.step !== expected) fail(spec, `repair step ${r.step}, expected ${expected}`);
          if (repairStepRequiresResult(r.step) !== (r.result !== undefined)) {
            fail(
              spec,
              'a repair result belongs to RETURNED_FROM_SERVICE alone, and is required there',
            );
          }
          ret.repairEvents.push({
            id: deterministicUuid(`return-repair-${spec.key}-${r.step}`),
            step: r.step,
            result: r.result ?? null,
            destination: r.destination ?? null,
            ttn: r.ttn ?? null,
            note: r.note ?? null,
            actor: shop,
            at: when,
          });
          break;
        }
        case 'received': {
          const to: ReturnStatus = 'RECEIVED';
          if (
            !canTransitionReturn(ret.status, to) ||
            !decisionPermitsTransition(to, ret.decision)
          ) {
            fail(spec, `${ret.status} → RECEIVED is not allowed`);
          }
          if (spec.received!.restock) {
            if (to !== RESTOCK_ON_STATUS) fail(spec, 'restock happens on RECEIVED only');
            ret.restockedAt = when;
          }
          ret.status = to;
          ret.resolvedAt = when;
          break;
        }
        case 'credit': {
          const c = spec.credit!;
          if (ret.decision !== 'REFUND' || ret.creditKop === null) {
            fail(spec, 'only a refund return has a credit to lower');
          }
          const requestedKop = toCents(String(c.lowerTo));
          const verdict = assessCreditChange({
            computedKop: computeCredit(ret),
            paidOutKop: paidOut(ret),
            requestedKop,
          });
          if (!verdict.ok) fail(spec, `credit change refused: ${verdict.refusal}`);
          if (!c.reason.trim()) fail(spec, 'a lowered credit needs a reason');
          ret.creditKop = requestedKop;
          ret.creditReason = c.reason;
          break;
        }
        case 'payout': {
          const p = spec.payouts![event.index];
          const { paidKop, refundedKop } = totals();
          const refundReturns = all().filter((r) => r.decision === 'REFUND');
          const amountKop = Math.max(0, (ret.creditKop ?? 0) - paidOut(ret));
          const verdict = assessPayout(
            {
              orderStatus,
              paidKop,
              refundedKop,
              balanceKop: deriveBalance({
                totalKop: order.totalKop,
                returnCreditKop: creditSum(),
                paidKop,
                refundedKop,
                orderStatus,
              }),
              outstandingReturnCreditKop: outstandingReturnCreditKop(
                refundReturns.map((r) => ({ creditKop: r.creditKop, paidOutKop: paidOut(r) })),
              ),
            },
            amountKop,
            {
              decision: ret.decision,
              status: ret.status,
              creditKop: ret.creditKop,
              paidOutKop: paidOut(ret),
            },
          );
          if (!verdict.ok) fail(spec, `payout ${p.kind} refused: ${verdict.refusal}`);
          if (amountKop <= 0) fail(spec, 'a payout of nothing');

          let paymentId: string | null = null;
          if (p.kind === 'LIQPAY_REFUND') {
            const receipt = order.entries.find((e) => e.kind === 'LIQPAY_PAYMENT');
            if (!receipt) fail(spec, 'a LiqPay refund needs a LiqPay payment on the order');
            paymentId = receipt.paymentId;
            const available = providerRefundAvailableKop({
              paymentInKop: receipt.amountKop,
              paymentRefundedKop: payouts
                .filter((x) => x.paymentId === paymentId)
                .reduce((s, x) => s + x.amountKop, 0),
              orderPaidKop: paidKop,
              orderRefundedKop: refundedKop,
            });
            if (amountKop > available) fail(spec, 'above what the LiqPay attempt can refund');
          }
          const payout: PlannedPayout = {
            id: deterministicUuid(`money-return-${spec.key}-${event.index}`),
            kind: p.kind,
            direction: 'OUT',
            amountKop,
            paymentId,
            // The ledger's discriminator for a LiqPay refund; confirmed by the callback.
            providerRef: paymentId
              ? deterministicUuid(`liqpay-refund-${spec.key}-${event.index}`)
              : null,
            providerState: paymentId ? 'CONFIRMED' : null,
            actor: shop,
            reason: null,
            reversalOfId: null,
            counterpartOrderId: null,
            occurredAt: when,
            returnId: ret.id,
          };
          payouts.push(payout);
          entries.push(payout);

          // The order re-derives (recompute) and the return follows its payouts.
          const after = totals();
          const nextPayment = derivePaymentStatus({
            totalKop: order.totalKop,
            paidKop: after.paidKop,
            refundedKop: after.refundedKop,
            lastAttemptFailed: false,
          });
          const nextStatus = deriveOrderStatus({
            orderStatus,
            refundedKop: after.refundedKop,
            lines,
            refundReturns: all()
              .filter((r) => r.decision === 'REFUND')
              .map((r) => ({
                creditKop: r.creditKop,
                paidOutKop: paidOut(r),
                status: r.status,
                items: r.items,
              })),
            payoutUndone: false,
            refundedFrom: null,
          });
          if (nextStatus !== orderStatus) {
            history.push({
              changeType: 'STATUS',
              fromStatus: orderStatus,
              toStatus: nextStatus,
              fromPaymentStatus: null,
              toPaymentStatus: null,
              note: null,
              actor: shop,
              at: when,
            });
            orderStatus = nextStatus;
          }
          if (nextPayment !== paymentStatus) {
            history.push({
              changeType: 'PAYMENT_STATUS',
              fromStatus: null,
              toStatus: null,
              fromPaymentStatus: paymentStatus,
              toPaymentStatus: nextPayment,
              note: null,
              actor: shop,
              at: when,
            });
            paymentStatus = nextPayment;
          }
          const retStatus = returnStatusAfterPayouts({
            status: ret.status,
            decision: ret.decision,
            creditKop: ret.creditKop,
            paidOutKop: paidOut(ret),
          });
          if (retStatus !== ret.status) {
            ret.status = retStatus;
            ret.resolvedAt = when;
          }
          break;
        }
      }
    }

    for (const ret of state.values()) {
      if (ret.status !== ret.spec.status) {
        fail(ret.spec, `the events above end in ${ret.status}, the spec says ${ret.spec.status}`);
      }
      returns.push(ret);
    }
    const refunded = orderStatus === 'REFUNDED';
    if (refunded !== Boolean(order.spec.refundedByReturns)) {
      fail(
        orderSpecs[0],
        `order «${orderKey}» ends ${orderStatus}; refundedByReturns says ${Boolean(order.spec.refundedByReturns)}`,
      );
    }

    const attempts = order.payments
      .filter((p) => p.status === 'SUCCEEDED')
      .map((p) => {
        const inKop = order.entries
          .filter((e) => e.paymentId === p.id)
          .reduce((s, e) => s + e.amountKop, 0);
        const confirmedRefundedKop = payouts
          .filter((x) => x.paymentId === p.id && x.providerState === 'CONFIRMED')
          .reduce((s, x) => s + x.amountKop, 0);
        return {
          paymentId: p.id,
          status: attemptStatusAfterRefunds({ current: 'SUCCEEDED', inKop, confirmedRefundedKop }),
        };
      })
      .filter((a) => a.status !== 'SUCCEEDED');

    outcomes.push({ order, payouts, history, status: orderStatus, paymentStatus, attempts });
  }

  return { returns, orders: outcomes };
}
