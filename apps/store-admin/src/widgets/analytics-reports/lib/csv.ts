/**
 * The /analytics CSV files (TASK-691) — built from the SAME data, and the same
 * on-screen state, each block renders: what the owner sees is what the file
 * holds, row for row, in the screen's order. Nothing is asked of the API.
 *
 * Conventions, fixed here once:
 * - money and counts as plain decimals (no «₴», no grouping) through the
 *   numeric door, so negatives stay numbers Excel can sum;
 * - money rounded to kopecks — the API's floats may carry binary noise;
 * - refunds NEGATIVE, as the screen prints them («−18 400 ₴»); the change
 *   column keeps the screen's own percentage, sign included;
 * - shares and conversion in PERCENT with one decimal (14.2, not 0.142), the
 *   unit the screen shows, so the file reads like the card;
 * - days as ISO `YYYY-MM-DD`; an unknown value (no previous period) is an
 *   empty cell, never a 0.
 */
import type {
  BrandReportEntity,
  CategoryReportRowEntity,
  ComparedValueEntity,
  FunnelReportEntity,
  ProductsReportEntity,
  RegistrationsReportEntity,
  ReportPeriodEntity,
  SalesReportEntity,
} from "@/entities/analytics";
import { dict } from "@/shared/config";
import {
  buildCsv,
  csvLine,
  joinCsvSections,
  n,
  t,
  type CsvCell,
} from "@/shared/lib/csv";
import { toKyivDateInput } from "@/shared/lib/format";
import { isEmptySales, soldNothing } from "./empty";

const d = dict.analytics;

export interface CsvFile {
  filename: string;
  csv: string;
}

export type CsvReport =
  "sales" | "categories" | "brands" | "products" | "funnel" | "registrations";

/** `sales-2026-09-06_2026-10-05.csv` — the report and the server's days. */
export function csvFilename(report: CsvReport, period: ReportPeriodEntity) {
  return `${report}-${period.from}_${period.to}.csv`;
}

/** Kopecks, no float noise. */
const money = (value: number) => n(Math.round(value * 100) / 100);
/** A 0…1 share as a percent with one decimal; empty when unknown. */
const percent = (value: number | null) =>
  value === null ? null : n(Math.round(value * 1000) / 10);
const change = (value: number | null) => (value === null ? null : n(value));

/** A section with its name on the line above its header. */
const titled = (title: string, table: string) =>
  `${csvLine([t(title)])}\r\n${table}`;

/* ── Sales ─────────────────────────────────────────────────────────────── */

export function salesCsv(data: SalesReportEntity): CsvFile {
  const row = (
    label: string,
    value: ComparedValueEntity,
    cell: (amount: number) => CsvCell,
  ): CsvCell[] => [
    t(label),
    cell(value.current),
    cell(value.previous),
    change(value.changePct),
  ];
  const outgoing = (amount: number) => money(amount === 0 ? 0 : -amount);

  const summary = buildCsv(
    [d.csvMetric, d.csvCurrent, d.csvPrevious, d.csvChange],
    [
      row(d.salesTile, data.sales, money),
      row(d.refundsTile, data.refunds, outgoing),
      row(d.netTile, data.net, money),
      row(d.ordersTile, data.orders, n),
      row(d.aovTile, data.averageOrderValue, money),
    ],
  );
  // An empty period has no chart on screen (ДН-8.7), so no per-day section.
  const daily = isEmptySales(data)
    ? []
    : [
        buildCsv(
          [d.csvDate, d.salesTile, d.refundsTile, d.netTile],
          data.daily.map((day) => [
            t(day.date),
            money(day.sales),
            outgoing(day.refunds),
            money(day.net),
          ]),
        ),
      ];
  return {
    filename: csvFilename("sales", data.period),
    csv: joinCsvSections([summary, ...daily]),
  };
}

/* ── Categories & brands ───────────────────────────────────────────────── */

interface Figures {
  units: ComparedValueEntity;
  orders: ComparedValueEntity;
  revenue?: ComparedValueEntity;
}

const figureCells = (row: Figures, showRevenue: boolean): CsvCell[] => [
  n(row.units.current),
  n(row.orders.current),
  ...(showRevenue ? [money(row.revenue?.current ?? 0)] : []),
];

/** The on-screen name of a category row — the «direct» row says so. */
export const categoryLabel = (row: CategoryReportRowEntity) =>
  row.direct ? d.directRow(row.name) : row.name;

export interface CategoriesCsvInput {
  period: ReportPeriodEntity;
  rows: readonly CategoryReportRowEntity[];
  /** Whether the screen shows «Виторг». */
  showRevenue: boolean;
  /** The rows the screen has open… */
  expanded: ReadonlySet<string>;
  /** …and their loaded children (`undefined` while still loading). */
  childrenOf: (
    categoryId: string,
  ) => readonly CategoryReportRowEntity[] | undefined;
}

/**
 * The visible rows, depth-first in display order: a root, then — if it is
 * open and its children are loaded — each child (recursively), with the
 * parent's name in its own column.
 */
export function categoriesCsv({
  period,
  rows,
  showRevenue,
  expanded,
  childrenOf,
}: CategoriesCsvInput): CsvFile {
  const lines: CsvCell[][] = [];
  const walk = (
    level: readonly CategoryReportRowEntity[],
    parent: string | null,
  ) => {
    for (const row of level) {
      lines.push([
        t(categoryLabel(row)),
        parent === null ? null : t(parent),
        ...figureCells(row, showRevenue),
      ]);
      if (row.hasChildren && expanded.has(row.categoryId)) {
        const children = childrenOf(row.categoryId);
        if (children) walk(children, row.name);
      }
    }
  };
  // Nothing sold: the screen says so in one line instead of zero rows.
  if (!soldNothing(rows)) walk(rows, null);

  return {
    filename: csvFilename("categories", period),
    csv: buildCsv(
      [
        d.colCategory,
        d.csvParent,
        d.colUnits,
        d.colOrders,
        ...(showRevenue ? [d.colRevenue] : []),
      ],
      lines,
    ),
  };
}

export function brandsCsv(
  data: BrandReportEntity,
  showRevenue: boolean,
): CsvFile {
  return {
    filename: csvFilename("brands", data.period),
    csv: buildCsv(
      [
        d.colBrand,
        d.colUnits,
        d.colOrders,
        ...(showRevenue ? [d.colRevenue] : []),
      ],
      soldNothing(data.rows)
        ? []
        : data.rows.map((row) => [
            t(row.name ?? d.noBrand),
            ...figureCells(row, showRevenue),
          ]),
    ),
  };
}

/* ── Products ──────────────────────────────────────────────────────────── */

/**
 * The two lists as shown: the top `leadersShown` leaders, then the outsider
 * rows on screen (five, or the expanded list), then their total.
 */
export function productsCsv(
  data: ProductsReportEntity,
  leadersShown: number,
): CsvFile {
  const leaders = data.leaders.slice(0, leadersShown);
  const showRevenue = leaders.some((row) => row.revenue !== undefined);

  const leadersTable = buildCsv(
    [
      d.csvRank,
      d.csvProduct,
      d.csvUnits,
      d.colOrders,
      ...(showRevenue ? [d.colRevenue] : []),
    ],
    leaders.map((row, index) => [
      n(index + 1),
      t(row.name),
      n(row.units.current),
      n(row.orders.current),
      ...(showRevenue ? [money(row.revenue?.current ?? 0)] : []),
    ]),
  );
  const outsidersTable = buildCsv(
    [d.csvProduct, d.csvStock, d.csvAdded],
    data.outsiders.rows.map((row) => [
      t(row.name),
      n(row.stock),
      t(toKyivDateInput(row.createdAt)),
    ]),
  );
  const total = buildCsv([d.csvOutsidersTotal], [[n(data.outsiders.total)]]);

  return {
    filename: csvFilename("products", data.period),
    csv: joinCsvSections([
      titled(d.csvLeaders, leadersTable),
      titled(d.csvOutsiders, outsidersTable),
      total,
    ]),
  };
}

/* ── Funnel ────────────────────────────────────────────────────────────── */

const STEP_LABEL: Record<string, string> = {
  add_to_cart: d.stepAddToCart,
  begin_checkout: d.stepBeginCheckout,
  purchase: d.stepPurchase,
};
const stepLabel = (event: string) => STEP_LABEL[event] ?? event;

/** `null` when there are no numbers — the button is not offered then. */
export function funnelCsv(data: FunnelReportEntity): CsvFile | null {
  if (!data.configured || !data.available || !data.steps) return null;

  const steps = buildCsv(
    [d.csvStep, d.csvCurrent, d.csvPrevious, d.csvChange],
    data.steps.map((step) => [
      t(stepLabel(step.event)),
      n(step.count.current),
      n(step.count.previous),
      change(step.count.changePct),
    ]),
  );
  const transitions = buildCsv(
    [d.csvFrom, d.csvTo, d.csvShare, d.csvShareWas],
    (data.transitions ?? []).map((transition) => [
      t(stepLabel(transition.from)),
      t(stepLabel(transition.to)),
      percent(transition.rate),
      percent(transition.previousRate),
    ]),
  );
  const conversion = buildCsv(
    [d.funnelConversion, d.csvConversionCurrent, d.csvConversionPrevious],
    [
      [
        t(d.funnelTitle),
        percent(data.conversion),
        percent(data.previousConversion),
      ],
    ],
  );
  return {
    filename: csvFilename("funnel", data.period),
    csv: joinCsvSections([
      steps,
      titled(d.csvTransitions, transitions),
      conversion,
    ]),
  };
}

/* ── Registrations ─────────────────────────────────────────────────────── */

export function registrationsCsv(data: RegistrationsReportEntity): CsvFile {
  const row = (label: string, value: ComparedValueEntity): CsvCell[] => [
    t(label),
    n(value.current),
    n(value.previous),
    change(value.changePct),
  ];
  const summary = buildCsv(
    [d.csvMetric, d.csvCurrent, d.csvPrevious, d.csvChange],
    [
      row(d.registrationsNew, data.registrations),
      row(d.registrationsFromGuest, data.fromGuest),
    ],
  );
  const daily = buildCsv(
    [d.csvDate, d.csvRegistrationsDay],
    data.daily.map((day) => [t(day.date), n(day.registrations)]),
  );
  return {
    filename: csvFilename("registrations", data.period),
    csv: joinCsvSections([summary, daily]),
  };
}
