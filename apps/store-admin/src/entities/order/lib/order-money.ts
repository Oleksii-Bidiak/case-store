import {
  MoneyEntryKind,
  MoneyInKind,
  MoneyOutKind,
  MoneyProviderState,
  OrderEntityDeliveryMethod,
  OrderEntityPaymentMethod,
  OrderEntityStatus,
  type OrderMoneyEntity,
  type OrderMoneyEntryEntity,
} from "@/shared/api";
import { dict } from "@/shared/config";
import { formatKop, parseKop } from "@/shared/lib";

/**
 * How the order money journal reads on screen (R2: TASK-1967 / 1807 / 2047).
 *
 * Labels and display rules only. Every number — paid, refunded, the balance,
 * what may still go back — comes from the server's `GET …/money` payload; none
 * is recomputed here.
 */

const m = dict.orderMoney;

/** A journal row's kind as a noun: «Оплата через LiqPay», «Повернення переказом». */
export function moneyKindLabel(kind: string): string {
  // A switch rather than `labels[kind]`: each key stays visible to the
  // dictionary-usage guard (TASK-816).
  switch (kind) {
    case MoneyEntryKind.LIQPAY_PAYMENT:
      return m.kindLabels.LIQPAY_PAYMENT;
    case MoneyEntryKind.COD_NOVA_POSHTA:
      return m.kindLabels.COD_NOVA_POSHTA;
    case MoneyEntryKind.PAID_AT_POINT:
      return m.kindLabels.PAID_AT_POINT;
    case MoneyEntryKind.PAID_TO_COURIER:
      return m.kindLabels.PAID_TO_COURIER;
    case MoneyEntryKind.BANK_TRANSFER:
      return m.kindLabels.BANK_TRANSFER;
    case MoneyEntryKind.LIQPAY_REFUND:
      return m.kindLabels.LIQPAY_REFUND;
    case MoneyEntryKind.CASH_REFUND:
      return m.kindLabels.CASH_REFUND;
    case MoneyEntryKind.TRANSFER_REFUND:
      return m.kindLabels.TRANSFER_REFUND;
    default:
      return kind;
  }
}

/**
 * The «Записати надходження» option for a receipt kind (TASK-1807): the server
 * already narrowed `allowedInKinds` to the order's delivery, so the label per
 * kind IS the label per delivery — «Гроші від НП отримано» only ever appears on
 * a Nova Poshta order.
 */
export function receiptKindLabel(kind: string): string {
  switch (kind) {
    case MoneyInKind.COD_NOVA_POSHTA:
      return m.receiptKinds.COD_NOVA_POSHTA;
    case MoneyInKind.PAID_AT_POINT:
      return m.receiptKinds.PAID_AT_POINT;
    case MoneyInKind.PAID_TO_COURIER:
      return m.receiptKinds.PAID_TO_COURIER;
    case MoneyInKind.BANK_TRANSFER:
      return m.receiptKinds.BANK_TRANSFER;
    default:
      return moneyKindLabel(kind);
  }
}

/**
 * An amount as the operator typed it, checked the way the money DTOs check it:
 * whole kopecks, > 0, and — when a ceiling is given — no more than it (the
 * server's own figure, e.g. `outWithoutReturnMaxKop`). The server stays the
 * boundary: money moved in another tab is only known there.
 */
export function checkMoneyAmount(
  raw: string,
  maxKop: number | null = null,
): { ok: true; kop: number } | { ok: false; message: string } {
  const kop = parseKop(raw);
  if (kop === null) return { ok: false, message: m.amountInvalid };
  if (kop <= 0) return { ok: false, message: m.amountZero };
  if (maxKop !== null && kop > maxKop) {
    return { ok: false, message: m.amountTooLarge(formatKop(maxKop)) };
  }
  return { ok: true, kop };
}

/** The kinds an operator may record by hand — LIQPAY_PAYMENT is LiqPay's alone. */
export function manualInKinds(money: Pick<OrderMoneyEntity, "allowedInKinds">) {
  const manual: readonly string[] = Object.values(MoneyInKind);
  return money.allowedInKinds.filter((kind): kind is MoneyInKind =>
    manual.includes(kind),
  );
}

/** «Готівкою на точці» / «Переказом» / «Через LiqPay». */
export function payoutKindLabel(kind: MoneyOutKind): string {
  switch (kind) {
    case MoneyOutKind.CASH_REFUND:
      return m.payoutMethods.CASH_REFUND;
    case MoneyOutKind.TRANSFER_REFUND:
      return m.payoutMethods.TRANSFER_REFUND;
    case MoneyOutKind.LIQPAY_REFUND:
      return m.payoutMethods.LIQPAY_REFUND;
    default:
      return kind;
  }
}

const PROVIDER_KINDS: readonly string[] = [
  MoneyEntryKind.LIQPAY_PAYMENT,
  MoneyEntryKind.LIQPAY_REFUND,
];

/**
 * Whether «Сторнувати» is worth offering on a row — `canReverse` of
 * `order-money.ts` on the server, mirrored so a button that can only be
 * refused is not drawn. The server stays the authority (409
 * ORDER_MONEY_REVERSAL_REFUSED): a reversal of a reversal, a LiqPay row (its
 * correction is the provider's), a voided request, a row already reversed.
 */
export function isReversibleEntry(
  entry: Pick<
    OrderMoneyEntryEntity,
    "kind" | "reversalOfId" | "reversedById" | "voidedAt"
  >,
): boolean {
  return (
    entry.reversalOfId === null &&
    !PROVIDER_KINDS.includes(entry.kind) &&
    entry.voidedAt === null &&
    entry.reversedById === null
  );
}

/** A LiqPay refund still waiting for the provider — the only row «Анулювати запит» fits. */
export function isPendingProviderRefund(
  entry: Pick<OrderMoneyEntryEntity, "kind" | "providerState" | "voidedAt">,
): boolean {
  return (
    entry.kind === MoneyEntryKind.LIQPAY_REFUND &&
    entry.providerState === MoneyProviderState.REQUESTED &&
    entry.voidedAt === null
  );
}

/**
 * What the shop is waiting for, worded by how the order is paid and travels
 * (TASK-1807) — `null` when nothing is due, the order is cancelled, or the
 * money comes through LiqPay (it records itself).
 *
 * `balanceKop` is the server's: > 0 means the customer still owes it.
 */
export function moneyDueText(
  money: Pick<
    OrderMoneyEntity,
    "orderStatus" | "paymentMethod" | "deliveryMethod" | "totals"
  >,
  amount: string,
): { title: string; hint: string } | null {
  if (money.totals.balanceKop <= 0) return null;
  if (money.orderStatus === OrderEntityStatus.CANCELLED) return null;
  if (money.paymentMethod === OrderEntityPaymentMethod.BANK_TRANSFER) {
    return { title: m.dueBankTransfer(amount), hint: m.dueBankTransferHint };
  }
  if (money.paymentMethod !== OrderEntityPaymentMethod.ON_DELIVERY) {
    return null;
  }
  switch (money.deliveryMethod) {
    case OrderEntityDeliveryMethod.NOVA_POSHTA:
      return { title: m.dueNovaPoshta(amount), hint: m.dueNovaPoshtaHint };
    case OrderEntityDeliveryMethod.PICKUP:
      return { title: m.duePickup(amount), hint: m.duePickupHint };
    case OrderEntityDeliveryMethod.COURIER:
      return { title: m.dueCourier(amount), hint: m.dueCourierHint };
    default:
      return { title: m.dueOther(amount), hint: m.dueOtherHint };
  }
}
