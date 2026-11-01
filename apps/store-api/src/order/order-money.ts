import {
  DeliveryMethod,
  MoneyDirection,
  MoneyEntryKind,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';

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
}

/**
 * The payment status, derived from the ledger (plan §1). PARTIALLY_PAID is its
 * own value so no reader of PENDING ever charges the full amount a second time.
 */
export function derivePaymentStatus(input: PaymentStatusInput): PaymentStatus {
  const { totalKop, paidKop, refundedKop, lastAttemptFailed } = input;
  assertKopecks(totalKop, paidKop, refundedKop);
  if (paidKop <= 0) {
    return lastAttemptFailed ? PaymentStatus.FAILED : PaymentStatus.PENDING;
  }
  if (refundedKop <= 0) {
    return paidKop < totalKop ? PaymentStatus.PARTIALLY_PAID : PaymentStatus.PAID;
  }
  return refundedKop >= paidKop ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;
}

// ── Balance ─────────────────────────────────────────────────────────────────

/** Order statuses in which the customer owes nothing for the goods. */
const NOTHING_DUE: readonly OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.REFUNDED];

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
 * `due − paid + refunded`, where `due = total − returnCredit` for a live order and
 * 0 for a cancelled or refunded one — a cancelled order is not a debt, and money
 * kept on it is owed back.
 */
export function deriveBalance(input: BalanceInput): number {
  const { totalKop, returnCreditKop, paidKop, refundedKop, orderStatus } = input;
  assertKopecks(totalKop, returnCreditKop, paidKop, refundedKop);
  const dueKop = NOTHING_DUE.includes(orderStatus) ? 0 : totalKop - returnCreditKop;
  return dueKop - paidKop + refundedKop;
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
