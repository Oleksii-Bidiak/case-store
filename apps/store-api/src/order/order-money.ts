import {
  DeliveryMethod,
  MoneyDirection,
  MoneyEntryKind,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMethod,
  PaymentStatus,
  ReturnDecision,
  ReturnStatus,
} from '@prisma/client';
import { DERIVED_REFUNDED_FROM } from './order-state-machine';

/**
 * The order money ledger's derived rules (TASK-2047 / TASK-2046 / TASK-951; R2
 * "payment from one place", B-12 theme 1).
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * Money used to live in four places that did not see each other
 * (`Return.refundedAmount`, `Payment.refundedAmount`, an amount-less
 * `paymentStatus` label, the analytics "remainder"). The ledger
 * (`OrderMoneyEntry`) is now the one record of money moving; everything a reader
 * shows — payment status, balance, "to refund" per return — is DERIVED here, from
 * integer kopecks, so the same numbers give the same answer everywhere.
 *
 * Pure on purpose (same role as `delivery-payment-matrix.ts`): no NestJS, no
 * Prisma client, no clock, no floats. Decimal columns are converted with
 * `toCents` (`addon-service/money.util.ts`) BEFORE they reach this module.
 */

/** Kinds that bring money in. LIQPAY_PAYMENT is written only by the provider path. */
export const IN_KINDS: readonly MoneyEntryKind[] = Object.freeze([
  MoneyEntryKind.LIQPAY_PAYMENT,
  MoneyEntryKind.COD_NOVA_POSHTA,
  MoneyEntryKind.PAID_AT_POINT,
  MoneyEntryKind.PAID_TO_COURIER,
  MoneyEntryKind.BANK_TRANSFER,
]);

/** Kinds that send money back to the customer. */
export const OUT_KINDS: readonly MoneyEntryKind[] = Object.freeze([
  MoneyEntryKind.LIQPAY_REFUND,
  MoneyEntryKind.CASH_REFUND,
  MoneyEntryKind.TRANSFER_REFUND,
]);

/** Entries only the LiqPay path writes and only it may change (never reversed by hand). */
const PROVIDER_KINDS: readonly MoneyEntryKind[] = [
  MoneyEntryKind.LIQPAY_PAYMENT,
  MoneyEntryKind.LIQPAY_REFUND,
];

/** Which way a kind moves money. */
export function directionOf(kind: MoneyEntryKind): MoneyDirection {
  return IN_KINDS.includes(kind) ? MoneyDirection.IN : MoneyDirection.OUT;
}

function assertKopecks(...values: number[]): void {
  for (const value of values) {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`Expected integer kopecks, got ${value}`);
    }
  }
}

// ── Payment status ──────────────────────────────────────────────────────────

export interface PaymentStatusInput {
  totalKop: number;
  paidKop: number;
  refundedKop: number;
  /** The latest LiqPay attempt failed — only consulted while nothing is paid. */
  lastAttemptFailed: boolean;
  /**
   * The order's current label when the R2 backfill could not find the amount
   * behind it (`LEGACY_MONEY_UNKNOWN` history note). A refund label is kept
   * while the ledger shows no money out — relabelling it PAID would erase the
   * only trace that something was refunded (A1 review risk, TASK-2047 A2).
   */
  legacyRefundLabel?: PaymentStatus | null;
}

const REFUND_LABELS: readonly PaymentStatus[] = [
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.REFUNDED,
];

/**
 * The payment status, derived from the ledger (plan §1). PARTIALLY_PAID is its
 * own value so no reader of PENDING ever charges the full amount a second time.
 */
export function derivePaymentStatus(input: PaymentStatusInput): PaymentStatus {
  const { totalKop, paidKop, refundedKop, lastAttemptFailed, legacyRefundLabel } = input;
  assertKopecks(totalKop, paidKop, refundedKop);
  if (refundedKop <= 0 && legacyRefundLabel && REFUND_LABELS.includes(legacyRefundLabel)) {
    return legacyRefundLabel;
  }
  if (paidKop <= 0) {
    return lastAttemptFailed ? PaymentStatus.FAILED : PaymentStatus.PENDING;
  }
  if (refundedKop <= 0) {
    return paidKop < totalKop ? PaymentStatus.PARTIALLY_PAID : PaymentStatus.PAID;
  }
  return refundedKop >= paidKop ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;
}

// ── Balance ─────────────────────────────────────────────────────────────────

export interface BalanceInput {
  totalKop: number;
  returnCreditKop: number;
  paidKop: number;
  refundedKop: number;
  orderStatus: OrderStatus;
}

/**
 * What is still owed, in kopecks: > 0 the customer owes the shop ("Борг"), < 0
 * the shop owes the customer ("Винні покупцю").
 *
 * `due − paid + refunded`, where `due` is:
 * - `total − returnCredit` for a live, shipped or delivered order;
 * - 0 for a CANCELLED one — a cancelled order is not a debt, and money kept on
 *   it is owed back;
 * - for a REFUNDED one (TASK-1969) what the shop may keep, `total − returnCredit`
 *   (the shipping and add-ons no return credits), but never more than it still
 *   holds: a refunded order never shows a debt. That also keeps a LEGACY
 *   REFUNDED order (set by hand before R2, everything paid back, no return
 *   credit) at 0 instead of «Борг = total». An overpayment still shows as owed
 *   back.
 */
export function deriveBalance(input: BalanceInput): number {
  const { totalKop, returnCreditKop, paidKop, refundedKop } = input;
  assertKopecks(totalKop, returnCreditKop, paidKop, refundedKop);
  return dueKop(input) - paidKop + refundedKop;
}

function dueKop(input: BalanceInput): number {
  const { totalKop, returnCreditKop, paidKop, refundedKop, orderStatus } = input;
  if (orderStatus === OrderStatus.CANCELLED) {
    return 0;
  }
  const goodsKeptKop = totalKop - returnCreditKop;
  if (orderStatus === OrderStatus.REFUNDED) {
    return Math.max(0, Math.min(goodsKeptKop, paidKop - refundedKop));
  }
  return goodsKeptKop;
}

// ── The order's own REFUNDED (TASK-1969 / TASK-1970) ────────────────────────

/** A REFUND-decided return as the derivation reads it. */
export interface RefundReturnCover {
  /** «До повернення»; null reads as 0. */
  creditKop: number | null;
  /** Σ of its payouts, net of reversals, voided ignored (REQUESTED counts). */
  paidOutKop: number;
  items: ReadonlyArray<{ orderItemId: string; quantity: number }>;
}

export interface OrderStatusDerivationInput {
  orderStatus: OrderStatus;
  /** The order's Σ OUT, net of reversals. */
  refundedKop: number;
  lines: ReadonlyArray<{ id: string; quantity: number }>;
  /** Every return of the order whose decision is REFUND. */
  refundReturns: ReadonlyArray<RefundReturnCover>;
  /** The money write of this transaction took a payout back (a reversal or a void). */
  payoutUndone: boolean;
  /** `fromStatus` of the last STATUS history row INTO REFUNDED, if any. */
  refundedFrom: OrderStatus | null;
}

/**
 * Everything the customer bought came back and was paid out (TASK-1969): every
 * order line's quantity is covered by REFUND-decided returns, each of those is
 * paid out up to its credit, and some money actually went back. Shipping and
 * add-ons are not lines, so a shop that keeps them still reaches REFUNDED.
 */
export function isOrderFullyRefunded(
  input: Pick<OrderStatusDerivationInput, 'refundedKop' | 'lines' | 'refundReturns'>,
): boolean {
  assertKopecks(input.refundedKop);
  if (input.refundedKop <= 0 || input.lines.length === 0) {
    return false;
  }
  const returned = new Map<string, number>();
  for (const ret of input.refundReturns) {
    assertKopecks(ret.paidOutKop, ret.creditKop ?? 0);
    if (ret.paidOutKop < (ret.creditKop ?? 0)) {
      return false;
    }
    for (const item of ret.items) {
      returned.set(item.orderItemId, (returned.get(item.orderItemId) ?? 0) + item.quantity);
    }
  }
  return input.lines.every((line) => (returned.get(line.id) ?? 0) >= line.quantity);
}

/**
 * The order status the ledger implies (TASK-1969):
 * - SHIPPED/DELIVERED and {@link isOrderFullyRefunded} → REFUNDED;
 * - REFUNDED that no longer is, AFTER a payout was taken back (reversal or
 *   void) → the status it came from (SHIPPED/DELIVERED only);
 * - anything else stays where it is. CANCELLED never becomes REFUNDED.
 *
 * Why a REFUNDED order only moves back after an undone payout: orders set
 * REFUNDED by hand before R2 have no returns covering their lines, so they
 * never pass the test. A receipt, a credit change or an order-status recompute
 * on such an order must not quietly turn it into DELIVERED — only a reversal,
 * which says in so many words that the money did not all go back, may.
 */
export function deriveOrderStatus(input: OrderStatusDerivationInput): OrderStatus {
  const { orderStatus, payoutUndone, refundedFrom } = input;
  const fullyRefunded = isOrderFullyRefunded(input);
  if (DERIVED_REFUNDED_FROM.includes(orderStatus)) {
    return fullyRefunded ? OrderStatus.REFUNDED : orderStatus;
  }
  if (
    orderStatus === OrderStatus.REFUNDED &&
    !fullyRefunded &&
    payoutUndone &&
    refundedFrom !== null &&
    DERIVED_REFUNDED_FROM.includes(refundedFrom)
  ) {
    return refundedFrom;
  }
  return orderStatus;
}

// ── "To refund" per return ──────────────────────────────────────────────────

/**
 * Each order line's value net of its share of the promo discount, so that
 * Σ result = Σ gross − discount EXACTLY (largest-remainder method).
 *
 * The discount is clamped to the goods (it never touches shipping or add-ons —
 * see `Order.addonsTotal`). Leftover kopecks go to the largest remainders, ties
 * to the EARLIER line: callers pass lines in `(createdAt, id)` order, which is
 * also how the R2 backfill orders them, so code and SQL agree to the kopeck.
 */
export function allocateReturnCredit(
  lines: ReadonlyArray<{ grossKop: number }>,
  discountKop: number,
): number[] {
  assertKopecks(discountKop, ...lines.map((line) => line.grossKop));
  if (lines.length === 0) {
    return [];
  }
  const gross = lines.reduce((sum, line) => sum + BigInt(line.grossKop), 0n);
  const discount =
    BigInt(Math.max(0, discountKop)) > gross ? gross : BigInt(Math.max(0, discountKop));
  if (gross === 0n || discount === 0n) {
    return lines.map((line) => line.grossKop);
  }

  const shares = lines.map((line, index) => {
    const product = discount * BigInt(line.grossKop);
    return { index, share: product / gross, remainder: product % gross };
  });
  let leftover = discount - shares.reduce((sum, s) => sum + s.share, 0n);
  const byRemainder = [...shares].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const entry of byRemainder) {
    if (leftover === 0n) {
      break;
    }
    entry.share += 1n;
    leftover -= 1n;
  }
  return shares.map((s) => lines[s.index].grossKop - Number(s.share));
}

/**
 * The credit for `returnedNow` units of a line whose whole net value is
 * `lineCreditKop`, when `returnedBefore` units of it were already credited.
 * Telescoping (`⌊net·after/qty⌋ − ⌊net·before/qty⌋`), so any sequence of partial
 * returns sums to the line credit exactly and never above it.
 */
export function unitsCreditKop(
  lineCreditKop: number,
  quantity: number,
  returnedBefore: number,
  returnedNow: number,
): number {
  assertKopecks(lineCreditKop, quantity, returnedBefore, returnedNow);
  if (quantity <= 0) {
    return 0;
  }
  const before = Math.min(returnedBefore, quantity);
  const after = Math.min(returnedBefore + returnedNow, quantity);
  const at = (units: number) => (BigInt(lineCreditKop) * BigInt(units)) / BigInt(quantity);
  return Number(at(after) - at(before));
}

// ── Which receipts an operator may record ───────────────────────────────────

const DELIVERY_IN_KIND: Readonly<Record<DeliveryMethod, MoneyEntryKind | null>> = Object.freeze({
  [DeliveryMethod.NOVA_POSHTA]: MoneyEntryKind.COD_NOVA_POSHTA,
  [DeliveryMethod.PICKUP]: MoneyEntryKind.PAID_AT_POINT,
  [DeliveryMethod.COURIER]: MoneyEntryKind.PAID_TO_COURIER,
  // "The operator will quote shipping": no hand-over moment, only a transfer.
  [DeliveryMethod.OTHER]: null,
});

/**
 * The IN kinds an operator may record by hand: the delivery's own hand-over kind
 * plus a bank transfer, which is always possible. LIQPAY_PAYMENT never — only the
 * provider path writes it. The kind the customer chose comes first (UI default).
 */
export function allowedInKinds(
  paymentMethod: PaymentMethod,
  deliveryMethod: DeliveryMethod,
): MoneyEntryKind[] {
  const deliveryKind = DELIVERY_IN_KIND[deliveryMethod];
  if (deliveryKind === null) {
    return [MoneyEntryKind.BANK_TRANSFER];
  }
  return paymentMethod === PaymentMethod.BANK_TRANSFER
    ? [MoneyEntryKind.BANK_TRANSFER, deliveryKind]
    : [deliveryKind, MoneyEntryKind.BANK_TRANSFER];
}

// ── Totals ──────────────────────────────────────────────────────────────────

export interface LedgerRow {
  direction: MoneyDirection;
  amountKop: number;
  reversalOfId: string | null;
  voidedAt: Date | null;
}

/**
 * Σ IN and Σ OUT, each net of its reversals (a reversal has its original's
 * direction and is subtracted from it); voided rows never moved money.
 */
export function ledgerTotals(entries: ReadonlyArray<LedgerRow>): {
  paidKop: number;
  refundedKop: number;
} {
  let paidKop = 0;
  let refundedKop = 0;
  for (const entry of entries) {
    assertKopecks(entry.amountKop);
    if (entry.voidedAt !== null) {
      continue;
    }
    const signed = entry.reversalOfId === null ? entry.amountKop : -entry.amountKop;
    if (entry.direction === MoneyDirection.IN) {
      paidKop += signed;
    } else {
      refundedKop += signed;
    }
  }
  return { paidKop, refundedKop };
}

// ── LiqPay refunds ──────────────────────────────────────────────────────────

export interface ProviderRefundCeilingInput {
  /** The attempt's own receipt (its LIQPAY_PAYMENT), net of reversals. */
  paymentInKop: number;
  /** The attempt's LIQPAY_REFUND rows that are not voided — REQUESTED included. */
  paymentRefundedKop: number;
  /** The order's totals across every kind (the TASK-951 ceiling). */
  orderPaidKop: number;
  orderRefundedKop: number;
}

/**
 * How much may still be sent back through the provider for one attempt: what is
 * left on the attempt, and never more than the order's `paid − refunded`.
 */
export function providerRefundAvailableKop(input: ProviderRefundCeilingInput): number {
  const { paymentInKop, paymentRefundedKop, orderPaidKop, orderRefundedKop } = input;
  assertKopecks(paymentInKop, paymentRefundedKop, orderPaidKop, orderRefundedKop);
  return Math.max(0, Math.min(paymentInKop - paymentRefundedKop, orderPaidKop - orderRefundedKop));
}

/** Attempt statuses whose money the refund rule may move between. */
const SETTLED_ATTEMPT_STATUSES: readonly PaymentAttemptStatus[] = [
  PaymentAttemptStatus.SUCCEEDED,
  PaymentAttemptStatus.REFUNDED,
];

/**
 * The LiqPay attempt's own status after its refunds changed (R2 review): REFUNDED
 * only once the CONFIRMED refunds cover its receipt — a REQUESTED refund the
 * provider has not answered yet does not count, so the attempt stays refundable
 * (SUCCEEDED) if that request is later voided. Any other attempt is left alone.
 */
export function attemptStatusAfterRefunds(input: {
  current: PaymentAttemptStatus;
  inKop: number;
  confirmedRefundedKop: number;
}): PaymentAttemptStatus {
  const { current, inKop, confirmedRefundedKop } = input;
  assertKopecks(inKop, confirmedRefundedKop);
  if (!SETTLED_ATTEMPT_STATUSES.includes(current)) {
    return current;
  }
  return inKop > 0 && confirmedRefundedKop >= inKop
    ? PaymentAttemptStatus.REFUNDED
    : PaymentAttemptStatus.SUCCEEDED;
}

/**
 * Whether a `reversed` event may confirm the REQUESTED refund it is matched to
 * (TASK-2336 mitigation): when the provider reported an amount, it must equal
 * the request. A different amount is never confirmed blindly — it is recorded as
 * unmatched for the operator. Whether LiqPay reports the single refund or the
 * running total is still unconfirmed (TASK-2336 stays open).
 */
export function providerRefundMatches(input: {
  requestedKop: number;
  providerAmountKop: number | null;
}): boolean {
  assertKopecks(input.requestedKop);
  if (input.providerAmountKop === null) {
    return true;
  }
  assertKopecks(input.providerAmountKop);
  return input.providerAmountKop === input.requestedKop;
}

// ── Reversals ───────────────────────────────────────────────────────────────

export interface ReversibleEntry {
  id: string;
  direction: MoneyDirection;
  kind: MoneyEntryKind;
  amountKop: number;
  reversalOfId: string | null;
  voidedAt: Date | null;
  /** Some row already reverses this one. */
  reversed: boolean;
}

export type ReverseRefusal =
  'REVERSAL_OF_REVERSAL' | 'PROVIDER_ENTRY' | 'VOIDED' | 'ALREADY_REVERSED';

/** Whether an operator may reverse (сторнувати) this entry. */
export function canReverse(
  entry: ReversibleEntry,
): { ok: true } | { ok: false; reason: ReverseRefusal } {
  if (entry.reversalOfId !== null) {
    return { ok: false, reason: 'REVERSAL_OF_REVERSAL' };
  }
  if (PROVIDER_KINDS.includes(entry.kind)) {
    return { ok: false, reason: 'PROVIDER_ENTRY' };
  }
  if (entry.voidedAt !== null) {
    return { ok: false, reason: 'VOIDED' };
  }
  if (entry.reversed) {
    return { ok: false, reason: 'ALREADY_REVERSED' };
  }
  return { ok: true };
}

/** The reversal row for `entry`: same direction, kind and amount, pointing back at it. */
export function reversalDraft(entry: ReversibleEntry): {
  direction: MoneyDirection;
  kind: MoneyEntryKind;
  amountKop: number;
  reversalOfId: string;
} {
  return {
    direction: entry.direction,
    kind: entry.kind,
    amountKop: entry.amountKop,
    reversalOfId: entry.id,
  };
}

// ── What an operator may record (R2 step A3) ────────────────────────────────
//
// TASK-2047 / TASK-2046 / TASK-1968 / TASK-951. The rules below answer "may
// this money move, and up to how much" from numbers read under the order-row
// lock. They know nothing about who is asking — permissions are the
// controller's business — so the same answer reaches every caller.

export type ReceiptRefusal = 'IN_KIND_NOT_ALLOWED' | 'OVERPAYMENT_REASON_REQUIRED';

export interface ReceiptInput {
  kind: MoneyEntryKind;
  amountKop: number;
  reason: string | null;
  paymentMethod: PaymentMethod;
  deliveryMethod: DeliveryMethod;
  /** What is still owed before this receipt (`deriveBalance`). */
  balanceKop: number;
}

/**
 * Whether an operator may record this receipt: the kind must be one the order's
 * delivery admits ({@link allowedInKinds} — never LIQPAY_PAYMENT), a part
 * payment is fine, and money beyond what is owed needs a reason — an
 * overpayment is legal (it becomes «Винні покупцю») but never silent.
 */
export function assessReceipt(
  input: ReceiptInput,
): { ok: true } | { ok: false; refusal: ReceiptRefusal } {
  assertKopecks(input.amountKop, input.balanceKop);
  if (!allowedInKinds(input.paymentMethod, input.deliveryMethod).includes(input.kind)) {
    return { ok: false, refusal: 'IN_KIND_NOT_ALLOWED' };
  }
  const hasReason = (input.reason ?? '').trim().length > 0;
  if (input.amountKop > input.balanceKop && !hasReason) {
    return { ok: false, refusal: 'OVERPAYMENT_REASON_REQUIRED' };
  }
  return { ok: true };
}

export type PayoutRefusal =
  | 'NOTHING_PAID'
  | 'ORDER_LIVE'
  | 'RETURN_REQUIRED'
  | 'RETURN_NOT_REFUND'
  | 'RETURN_NOT_RECEIVED'
  | 'EXCEEDS';

/** The order's money as a payout sees it, read under the order-row lock. */
export interface PayoutBasis {
  orderStatus: OrderStatus;
  paidKop: number;
  refundedKop: number;
  balanceKop: number;
  /** Σ over REFUND-decided returns of what is still owed on them. */
  outstandingReturnCreditKop: number;
}

/** The return a payout settles, if any. */
export interface PayoutReturn {
  decision: ReturnDecision | null;
  status: ReturnStatus;
  creditKop: number | null;
  /** Σ of its payouts, net of reversals, voided ignored. */
  paidOutKop: number;
}

/** Orders still being prepared: their money goes back only after a cancel. */
const LIVE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
];

/** Return statuses at which the goods are back, so their money may go out. */
const PAYABLE_RETURN_STATUSES: readonly ReturnStatus[] = [
  ReturnStatus.RECEIVED,
  ReturnStatus.REFUNDED,
];

export type PayoutVerdict =
  { ok: true; availableKop: number } | { ok: false; refusal: PayoutRefusal; availableKop: number };

function payoutCeiling(basis: PayoutBasis, ret?: PayoutReturn): PayoutVerdict {
  const { orderStatus, paidKop, refundedKop, balanceKop, outstandingReturnCreditKop } = basis;
  assertKopecks(paidKop, refundedKop, balanceKop, outstandingReturnCreditKop);
  const heldKop = paidKop - refundedKop;
  const refuse = (refusal: PayoutRefusal): PayoutVerdict => ({
    ok: false,
    refusal,
    availableKop: 0,
  });

  if (heldKop <= 0) {
    return refuse('NOTHING_PAID');
  }

  if (ret) {
    if (ret.decision !== ReturnDecision.REFUND) {
      return refuse('RETURN_NOT_REFUND');
    }
    if (!PAYABLE_RETURN_STATUSES.includes(ret.status)) {
      return refuse('RETURN_NOT_RECEIVED');
    }
    const owedKop = Math.max(0, (ret.creditKop ?? 0) - ret.paidOutKop);
    return { ok: true, availableKop: Math.min(owedKop, heldKop) };
  }

  // A cancelled order owes nothing for goods: every kopeck still held goes back.
  // A REFUNDED one (TASK-1969) keeps what no return credits (shipping, add-ons)
  // and falls through to the overpayment rule below, like a delivered order.
  if (orderStatus === OrderStatus.CANCELLED) {
    return { ok: true, availableKop: heldKop };
  }

  // Otherwise only an overpayment — what is owed back beyond the returns' own
  // credit, which must leave through its return.
  const overpaidKop = Math.min(heldKop, Math.max(0, -balanceKop - outstandingReturnCreditKop));
  if (overpaidKop > 0) {
    return { ok: true, availableKop: overpaidKop };
  }
  return refuse(LIVE_STATUSES.includes(orderStatus) ? 'ORDER_LIVE' : 'RETURN_REQUIRED');
}

/**
 * Whether `amountKop` may be paid back, and the ceiling it was measured against.
 *
 * - Nothing held (`paid − refunded = 0`) → nothing can go back (TASK-2046: on an
 *   unpaid order a return only brings the goods back).
 * - With a return: REFUND-decided, goods RECEIVED (or later); up to its credit
 *   less its payouts, and never above what the order holds (TASK-951).
 * - Without one: a CANCELLED order up to `paid − refunded`; any other order only
 *   an overpayment (up to `−balance`, the returns' unpaid credit excluded). A
 *   SHIPPED/DELIVERED order otherwise needs a return; a live one is cancelled
 *   first — this closes the A2 path where a refund on a CONFIRMED order derived
 *   REFUNDED.
 */
export function assessPayout(
  basis: PayoutBasis,
  amountKop: number,
  ret?: PayoutReturn,
): PayoutVerdict {
  assertKopecks(amountKop);
  const verdict = payoutCeiling(basis, ret);
  if (!verdict.ok) {
    return verdict;
  }
  if (amountKop > verdict.availableKop) {
    return { ok: false, refusal: 'EXCEEDS', availableKop: verdict.availableKop };
  }
  return verdict;
}

/** The most that may go back WITHOUT a return right now; 0 when none may. */
export function outWithoutReturnMaxKop(basis: PayoutBasis): number {
  const verdict = payoutCeiling(basis);
  return verdict.ok ? verdict.availableKop : 0;
}

/** Σ over returns of what is still owed on each (credit − payouts, never < 0). */
export function outstandingReturnCreditKop(
  returns: ReadonlyArray<{ creditKop: number | null; paidOutKop: number }>,
): number {
  return returns.reduce((sum, ret) => sum + Math.max(0, (ret.creditKop ?? 0) - ret.paidOutKop), 0);
}

/**
 * A return's status after its payouts changed (TASK-2046): REFUNDED is derived.
 * A RECEIVED refund return whose payouts cover its credit becomes REFUNDED; a
 * reversal that breaks the cover sends it back to RECEIVED. Nothing paid out
 * never counts as refunded (a credit lowered to 0 stays RECEIVED). Any other
 * return is left where it is.
 */
export function returnStatusAfterPayouts(ret: {
  status: ReturnStatus;
  decision: ReturnDecision | null;
  creditKop: number | null;
  paidOutKop: number;
}): ReturnStatus {
  if (!PAYABLE_RETURN_STATUSES.includes(ret.status) || ret.decision !== ReturnDecision.REFUND) {
    return ret.status;
  }
  const covered = ret.paidOutKop > 0 && ret.paidOutKop >= (ret.creditKop ?? 0);
  return covered ? ReturnStatus.REFUNDED : ReturnStatus.RECEIVED;
}

export interface ReturnCreditInput {
  /** Every line of the order, in `(createdAt, id)` order (see {@link allocateReturnCredit}). */
  lines: ReadonlyArray<{ id: string; quantity: number; grossKop: number }>;
  discountKop: number;
  /** This return's lines. */
  items: ReadonlyArray<{ orderItemId: string; quantity: number }>;
  /** Units of each line already credited by the order's OTHER refund returns. */
  creditedBefore: ReadonlyMap<string, number>;
}

/**
 * «До повернення» for a return (TASK-2046): the returned units' value less their
 * share of the promo discount, telescoped over earlier returns of the same line
 * so a line returned in parts sums to its net value exactly. Add-ons and
 * shipping are not part of it (plan assumption 1).
 */
export function returnCreditFor(input: ReturnCreditInput): number {
  const net = allocateReturnCredit(input.lines, input.discountKop);
  const netById = new Map(input.lines.map((line, index) => [line.id, { line, net: net[index] }]));
  const counted = new Map(input.creditedBefore);
  let creditKop = 0;
  for (const item of input.items) {
    const entry = netById.get(item.orderItemId);
    if (!entry) {
      continue;
    }
    const before = counted.get(item.orderItemId) ?? 0;
    creditKop += unitsCreditKop(entry.net, entry.line.quantity, before, item.quantity);
    counted.set(item.orderItemId, before + item.quantity);
  }
  return creditKop;
}

export type CreditRefusal = 'ABOVE_COMPUTED' | 'BELOW_PAID_OUT';

/**
 * Whether the operator may set a return's credit to `requestedKop` (TASK-2046):
 * only down from the computed value — never above it — and never below what was
 * already paid out on the return.
 */
export function assessCreditChange(input: {
  computedKop: number;
  paidOutKop: number;
  requestedKop: number;
}): { ok: true } | { ok: false; refusal: CreditRefusal } {
  assertKopecks(input.computedKop, input.paidOutKop, input.requestedKop);
  if (input.requestedKop > input.computedKop) {
    return { ok: false, refusal: 'ABOVE_COMPUTED' };
  }
  if (input.requestedKop < input.paidOutKop) {
    return { ok: false, refusal: 'BELOW_PAID_OUT' };
  }
  return { ok: true };
}
