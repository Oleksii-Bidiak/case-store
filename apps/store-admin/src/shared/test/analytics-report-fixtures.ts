/**
 * Fixtures for the /analytics reports (TASK-692), in the shape the API emits
 * INSIDE the `{ data }` envelope. Builders, so a test can take the owner's
 * version (with money) or the version a manager without `analytics:revenue`
 * gets — where the API leaves the `revenue` key out, not null.
 *
 * Used by the default MSW handlers and by the report tests.
 */
import type {
  BrandReportEntity,
  CategoryReportEntity,
  CategoryReportRowEntity,
  ComparedValueEntity,
  FunnelReportEntity,
  ProductsReportEntity,
  RegistrationsReportEntity,
  ReportPeriodEntity,
  SalesReportEntity,
} from "@/shared/api";
import { shiftDay } from "@/shared/lib/format";

export const reportPeriod: ReportPeriodEntity = {
  preset: "30d",
  from: "2026-09-06",
  to: "2026-10-05",
  days: 30,
  previousFrom: "2026-08-07",
  previousTo: "2026-09-05",
  previousDays: 30,
};

const cv = (
  current: number,
  previous: number,
  changePct: number | null = previous
    ? Math.round(((current - previous) / previous) * 1000) / 10
    : null,
): ComparedValueEntity => ({ current, previous, changePct });

const days = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    shiftDay(reportPeriod.from, index),
  );

/** Drop the money the way the API does without `analytics:revenue`. */
function withoutRevenue<T extends { revenue?: ComparedValueEntity }>(
  row: T,
): T {
  const copy = { ...row };
  delete copy.revenue;
  return copy;
}

/* ── Sales ─────────────────────────────────────────────────────────────── */

/** 30 days; 2026-09-24 is a day of refunds only — net below zero. */
export function salesReport(): SalesReportEntity {
  const daily = days(30).map((date, index) => {
    if (date === "2026-09-24") {
      return { date, sales: 0, refunds: 1299, net: -1299 };
    }
    const sales = 10000 + index * 300;
    const refunds = index % 7 === 0 ? 500 : 0;
    return { date, sales, refunds, net: sales - refunds };
  });
  return {
    period: reportPeriod,
    sales: cv(412300, 368100, 12),
    refunds: cv(18400, 15460, 19),
    net: cv(393900, 352640, 11.7),
    orders: cv(176, 161, 9.3),
    averageOrderValue: cv(2238, 2190, 2.2),
    daily,
  };
}

/** An empty period: zeros everywhere, every day a zero. */
export function emptySalesReport(): SalesReportEntity {
  return {
    period: reportPeriod,
    sales: cv(0, 368100, -100),
    refunds: cv(0, 15460, -100),
    net: cv(0, 352640, -100),
    orders: cv(0, 161, -100),
    averageOrderValue: cv(0, 2190, -100),
    daily: days(30).map((date) => ({ date, sales: 0, refunds: 0, net: 0 })),
  };
}

/* ── Categories & brands ───────────────────────────────────────────────── */

export const CASES_ID = "cat-cases";

const categoryRow = (
  categoryId: string,
  name: string,
  units: number,
  orders: number,
  revenue: number,
  extra: Partial<CategoryReportRowEntity> = {},
): CategoryReportRowEntity => ({
  categoryId,
  name,
  units: cv(units, units),
  orders: cv(orders, orders),
  revenue: cv(revenue, revenue),
  direct: false,
  hasChildren: false,
  ...extra,
});

/** Roots — or, with `parentId = CASES_ID`, the cases' children. */
export function categoryReport(
  parentId: string | null = null,
  { revenue = true } = {},
): CategoryReportEntity {
  const rows =
    parentId === CASES_ID
      ? [
          categoryRow("cat-iphone", "Чохли для iPhone", 132, 84, 109200),
          categoryRow("cat-samsung", "Чохли для Samsung", 51, 33, 36900),
          categoryRow(CASES_ID, "Чохли", 31, 20, 22300, { direct: true }),
        ]
      : parentId
        ? []
        : [
            categoryRow(CASES_ID, "Чохли", 214, 131, 168400, {
              hasChildren: true,
            }),
            categoryRow("cat-phones", "Смартфони", 3, 3, 104997),
            categoryRow("cat-audio", "Навушники", 2, 2, 3900),
          ];
  return {
    period: reportPeriod,
    basis: "current-catalogue",
    parentId,
    rows: revenue ? rows : rows.map(withoutRevenue),
  };
}

/**
 * An empty period as the API sends it: every root category is listed, sold
 * or not, so «nothing sold» is a column of zeros rather than an empty list.
 */
export function unsoldCategoryReport(): CategoryReportEntity {
  return {
    ...categoryReport(),
    rows: categoryReport().rows.map((row) => ({
      ...row,
      units: cv(0, row.units.previous),
      orders: cv(0, row.orders.previous),
      revenue: cv(0, row.revenue?.previous ?? 0),
    })),
  };
}

export function brandReport({ revenue = true } = {}): BrandReportEntity {
  const rows = [
    {
      brandId: "brand-spigen",
      name: "Spigen",
      units: cv(120, 100),
      orders: cv(80, 70),
      revenue: cv(96000, 80000),
    },
    {
      brandId: null,
      name: null,
      units: cv(14, 10),
      orders: cv(9, 8),
      revenue: cv(4200, 3000),
    },
  ];
  return {
    period: reportPeriod,
    basis: "current-catalogue",
    rows: revenue ? rows : rows.map(withoutRevenue),
  };
}

/* ── Products ──────────────────────────────────────────────────────────── */

export const OUTSIDERS_TOTAL = 37;

export function productsReport(
  limit = 10,
  { revenue = true } = {},
): ProductsReportEntity {
  const leaders = [
    ["p-iphone", "Apple iPhone 16 Pro", 1, 54999],
    ["p-leather", "Шкіряний чохол Apple з MagSafe", 9, 26091],
    ["p-baseus", "Зарядка Baseus GaN 65 Вт", 14, 20986],
    ["p-silicone", "Силіконовий чохол для iPhone 15", 15, 19485],
    ["p-spigen", "Чохол Spigen Liquid Air для iPhone 15", 22, 16478],
    ["p-cable", "Кабель UGREEN USB-C", 30, 9000],
  ] as const;
  const rows = leaders.slice(0, limit).map(([productId, name, units, sum]) => {
    const row = {
      productId,
      name,
      units: cv(units, units),
      orders: cv(units, units),
      revenue: cv(sum, sum),
    };
    return revenue ? row : withoutRevenue(row);
  });
  return {
    period: reportPeriod,
    rankedBy: revenue ? "revenue" : "units",
    leaders: revenue
      ? rows
      : [...rows].sort((a, b) => b.units.current - a.units.current),
    outsiders: {
      total: OUTSIDERS_TOTAL,
      rows: Array.from(
        { length: Math.min(limit, OUTSIDERS_TOTAL) },
        (_, index) => ({
          productId: `p-out-${index + 1}`,
          name: `Товар без продажів ${index + 1}`,
          stock: 12,
          createdAt: "2026-03-10T09:00:00.000Z",
        }),
      ),
    },
  };
}

/* ── Funnel ────────────────────────────────────────────────────────────── */

export function funnelReport(): FunnelReportEntity {
  return {
    period: reportPeriod,
    configured: true,
    available: true,
    steps: [
      { event: "add_to_cart", count: cv(1240, 1100) },
      { event: "begin_checkout", count: cv(610, 517) },
      { event: "purchase", count: cv(176, 141) },
    ],
    transitions: [
      {
        from: "add_to_cart",
        to: "begin_checkout",
        rate: 0.49,
        previousRate: 0.47,
      },
      {
        from: "begin_checkout",
        to: "purchase",
        rate: 0.29,
        previousRate: 0.27,
      },
    ],
    conversion: 0.142,
    previousConversion: 0.128,
  };
}

export function funnelOff(available = false, configured = false) {
  return {
    period: reportPeriod,
    configured,
    available,
    steps: null,
    transitions: null,
    conversion: null,
    previousConversion: null,
  } satisfies FunnelReportEntity;
}

/* ── Registrations ─────────────────────────────────────────────────────── */

export function registrationsReport(): RegistrationsReportEntity {
  return {
    period: reportPeriod,
    registrations: cv(48, 40, 20),
    fromGuest: cv(11, 11, 0),
    daily: days(30).map((date, index) => ({
      date,
      registrations: index % 5,
    })),
  };
}
