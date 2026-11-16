/**
 * «Рух коштів» (TASK-2395) — the pure rules the block, the register and both
 * CSV files share, so the screen and the files cannot read one ledger two ways.
 *
 * Signs, fixed here once. The API gives magnitudes per kind and a `signedKop`
 * per entry that is negative only for a reversal (сторно) — the direction is
 * NOT folded in. The summary reads money from the shop's side: what came in is
 * plus, what went back is minus, and a reversal flips its original. Summing
 * the «Нетто» column of all eight kinds therefore gives «Рух нетто».
 */
import {
  MoneyDirection,
  MoneyEntryKind,
  type MoneyFlowEntryEntity,
  type MoneyFlowKindRowEntity,
  type MoneyFlowReportEntity,
} from "@/entities/analytics";
import { dict } from "@/shared/config";
import { formatKop } from "@/shared/lib";
import { toKyivDateInput } from "@/shared/lib/format";
import { MINUS } from "./format";
import {
  reportPeriodToUrl,
  type ReportPeriodSelection,
} from "../model/report-period";

const m = dict.orderMoney;

/** Kopecks with a true minus — «−18 400 ₴»; zero without a sign. */
export function formatSignedKop(kop: number): string {
  return kop < 0 ? `${MINUS}${formatKop(-kop)}` : formatKop(kop);
}

/** Every ledger kind, in the order the API sends the rows. */
export const MONEY_KINDS: readonly MoneyEntryKind[] =
  Object.values(MoneyEntryKind);

const isKind = (value: string): value is MoneyEntryKind =>
  (MONEY_KINDS as readonly string[]).includes(value);

/** A kind off the URL, or `undefined` — a typo must not become a 400. */
export function readMoneyKind(raw: string | null): MoneyEntryKind | undefined {
  return raw && isKind(raw) ? raw : undefined;
}

/** The order card's noun for a kind («Оплата через LiqPay»). */
export const moneyKindLabel = (kind: string): string =>
  (m.kindLabels as Record<string, string>)[kind] ?? kind;

/** The shop's side of a kind row: `+1` for money in, `−1` for money out. */
const sideOf = (direction: string) =>
  direction === MoneyDirection.OUT ? -1 : 1;

/** A kind row as the screen and the summary CSV show it — shop's side. */
export interface SignedKindRow {
  kind: MoneyEntryKind;
  direction: MoneyDirection;
  grossKop: number;
  reversedKop: number;
  netKop: number;
  count: number;
}

/** `-0` → `0`, so a zero never prints or exports as «−0». */
const clean = (value: number) => (value === 0 ? 0 : value);

export function signedKindRow(row: MoneyFlowKindRowEntity): SignedKindRow {
  const side = sideOf(row.direction);
  return {
    kind: row.kind,
    direction: row.direction,
    grossKop: clean(side * row.grossKop),
    // A reversal undoes its original: it takes from money in, gives back
    // to money out.
    reversedKop: clean(-side * row.reversedKop),
    netKop: clean(side * row.netKop),
    count: row.count,
  };
}

/** The rows of one direction, in the API's order. */
export function kindRowsOf(
  data: MoneyFlowReportEntity,
  direction: MoneyDirection,
): SignedKindRow[] {
  return data.rows
    .filter((row) => row.direction === direction)
    .map(signedKindRow);
}

/** No entry dated in the period at all — zeros, and a sentence. */
export function isEmptyMoneyFlow(data: MoneyFlowReportEntity): boolean {
  return data.rows.every((row) => row.count === 0);
}

/**
 * An entry's amount from the shop's side: IN plus, OUT minus, a reversal
 * flips it — what the register CSV writes in «Сума».
 */
export function entryShopKop(entry: MoneyFlowEntryEntity): number {
  return clean(sideOf(entry.direction) * entry.signedKop);
}

/** The Kyiv day an instant falls on, `YYYY-MM-DD`. */
const kyivDay = (iso: string) => toKyivDateInput(iso);

/**
 * «Внесено ДД.ММ» — only when the entry was written on another Kyiv day than
 * the money moved (a receipt logged the next morning). `null` otherwise.
 */
export function enteredOnOtherDay(entry: MoneyFlowEntryEntity): string | null {
  const moved = kyivDay(entry.occurredAt);
  const written = kyivDay(entry.createdAt);
  if (!written || written === moved) return null;
  return `${written.slice(8, 10)}.${written.slice(5, 7)}`;
}

const LIQPAY_KINDS: readonly string[] = [
  MoneyEntryKind.LIQPAY_PAYMENT,
  MoneyEntryKind.LIQPAY_REFUND,
];

/** Who wrote it — the operator, or LiqPay / the system for unsigned rows. */
export function entryActor(entry: MoneyFlowEntryEntity): string {
  return (
    entry.actorName ??
    (LIQPAY_KINDS.includes(entry.kind) ? m.actorLiqPay : m.actorSystem)
  );
}

/**
 * The register's link for a period — and a kind, when a summary row asks for
 * it. The period is spelled the way /analytics spells it, so the register
 * opens on the same days.
 */
export function moneyFlowEntriesHref(
  selection: ReportPeriodSelection,
  kind?: MoneyEntryKind,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(reportPeriodToUrl(selection))) {
    if (value) params.set(key, value);
  }
  if (kind) params.set("kind", kind);
  const query = params.toString();
  return query ? `/analytics/money-flow?${query}` : "/analytics/money-flow";
}
