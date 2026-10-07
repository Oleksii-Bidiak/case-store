import {
  OrderEntityDeliveryMethod,
  OrderEntityPaymentMethod,
  OrderEntityPaymentStatus,
  OrderEntityStatus,
  orderStatusLabel,
  paymentStatusLabel,
  type AdminOrderControllerFindAllParams,
} from "@/entities/order";
import { dict } from "@/shared/config";
// TASK-692: the day arithmetic moved to shared/lib (the report period needs it).
import { shiftDay } from "@/shared/lib/format";

const d = dict.orders;

/**
 * The server-side signal filters — booleans on `GET /admin/orders`, each one
 * written to the URL as `?<param>=true`. Order = order in the sheet.
 *
 * Six were toolbar toggles before wave 198 (TASK-425 / 470 / 471 / 352);
 * `unpaidInTransit` was a dashboard deep link with no control at all
 * (TASK-248) — now it is a visible, removable filter like the rest.
 */
export const SIGNAL_PARAMS = [
  "pendingOverdue",
  "hasDebt",
  "awaitingPayment",
  "reservationExpired",
  "hasUnavailableItems",
  "paidAfterCancel",
  "unpaidInTransit",
] as const;

export type SignalParam = (typeof SIGNAL_PARAMS)[number];

export const SIGNAL_LABELS: Record<
  SignalParam,
  { label: string; description: string }
> = {
  pendingOverdue: { label: d.overdueChip, description: d.overdueChipAria },
  hasDebt: { label: d.debtChip, description: d.debtChipAria },
  awaitingPayment: {
    label: d.awaitingPaymentChip,
    description: d.awaitingPaymentChipAria,
  },
  reservationExpired: {
    label: d.reservationExpiredChip,
    description: d.reservationExpiredChipAria,
  },
  hasUnavailableItems: {
    label: d.unavailableItemsChip,
    description: d.unavailableItemsChipAria,
  },
  paidAfterCancel: {
    label: d.paidAfterCancelChip,
    description: d.paidAfterCancelChipAria,
  },
  unpaidInTransit: {
    label: d.unpaidInTransitChip,
    description: d.unpaidInTransitChipAria,
  },
};

/** Every order status, in lifecycle order — the order of the CSV we write. */
export const STATUS_OPTIONS: readonly string[] = [
  OrderEntityStatus.PENDING,
  OrderEntityStatus.CONFIRMED,
  OrderEntityStatus.PROCESSING,
  OrderEntityStatus.SHIPPED,
  OrderEntityStatus.DELIVERED,
  OrderEntityStatus.CANCELLED,
  OrderEntityStatus.REFUNDED,
];

/**
 * Every payment status (TASK-425 / 472): "every value" is the rule, so a new
 * status the list cannot be filtered by cannot sneak in.
 */
export const PAYMENT_STATUS_OPTIONS: readonly string[] = Object.values(
  OrderEntityPaymentStatus,
);

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  [OrderEntityPaymentMethod.ONLINE]: d.paymentMethodOnline,
  [OrderEntityPaymentMethod.ON_DELIVERY]: d.paymentMethodOnDelivery,
  [OrderEntityPaymentMethod.INSTALLMENTS]: d.paymentMethodInstallments,
};

export const paymentMethodLabel = (method: string): string =>
  PAYMENT_METHOD_LABELS[method] ?? method;

/**
 * Delivery methods in the order of the settings cards and the checkout
 * (ДН-1.11): the filter's rows, and the order the CSV param is written in.
 */
export const DELIVERY_METHOD_OPTIONS: readonly string[] = [
  OrderEntityDeliveryMethod.NOVA_POSHTA,
  OrderEntityDeliveryMethod.PICKUP,
  OrderEntityDeliveryMethod.COURIER,
  OrderEntityDeliveryMethod.OTHER,
];

/** The filter's wording — «Курʼєр по місту», not the cell's short «Курʼєр». */
export const deliveryFilterLabel = (method: string): string =>
  (d.deliveryFilterLabels as Record<string, string>)[method] ?? method;

/**
 * Quick views (TASK-250) — presets over the SAME `?status=` param, written
 * verbatim. «Усі» is "no `?status=`"; its id never reaches the URL (TASK-405).
 */
export const ALL_VIEW = "__all__";

export const QUICK_VIEWS: ReadonlyArray<{ id: string; label: string }> = [
  { id: OrderEntityStatus.PENDING, label: d.tabNew },
  {
    id: `${OrderEntityStatus.CONFIRMED},${OrderEntityStatus.PROCESSING}`,
    label: d.tabProcessing,
  },
  { id: OrderEntityStatus.SHIPPED, label: d.tabShipped },
  { id: ALL_VIEW, label: d.tabAll },
];

/** A status the views do not cover (`DELIVERED`) matches none of them. */
export function activeQuickView(status: string): string {
  const id = status || ALL_VIEW;
  return QUICK_VIEWS.some((view) => view.id === id) ? id : "";
}

/** The list's filters as they sit in the URL. `""` / `[]` mean "any". */
export interface OrderFilters {
  /** `YYYY-MM-DD`, Kyiv calendar days — what the API reads. */
  dateFrom: string;
  dateTo: string;
  status: string[];
  paymentStatus: string;
  paymentMethod: string;
  /** One or several methods — a CSV in the URL and on the API (TASK-648). */
  deliveryMethod: string[];
  /**
   * One pickup point. Not in the sheet: it arrives by the deep link «Замовлення
   * з цією точкою» on `/settings/delivery` and leaves by its chip.
   */
  pickupPointId: string;
  signals: SignalParam[];
}

export const EMPTY_FILTERS: OrderFilters = {
  dateFrom: "",
  dateTo: "",
  status: [],
  paymentStatus: "",
  paymentMethod: "",
  deliveryMethod: [],
  pickupPointId: "",
  signals: [],
};

const csvList = (raw: string | null): string[] =>
  (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

export function readOrderFilters(params: URLSearchParams): OrderFilters {
  const status = csvList(params.get("status"));
  return {
    dateFrom: params.get("dateFrom") ?? "",
    dateTo: params.get("dateTo") ?? "",
    status,
    paymentStatus: params.get("paymentStatus") ?? "",
    paymentMethod: params.get("paymentMethod") ?? "",
    deliveryMethod: csvList(params.get("deliveryMethod")),
    pickupPointId: params.get("pickupPointId") ?? "",
    signals: SIGNAL_PARAMS.filter((param) => params.get(param) === "true"),
  };
}

/** Statuses in lifecycle order, unknown ones (a hand-typed URL) kept last. */
function statusCsv(status: readonly string[]): string {
  const known = STATUS_OPTIONS.filter((value) => status.includes(value));
  const unknown = status.filter((value) => !STATUS_OPTIONS.includes(value));
  return [...known, ...unknown].join(",");
}

/** Methods in the settings' order, unknown ones (a hand-typed URL) kept last. */
function deliveryCsv(methods: readonly string[]): string {
  const known = DELIVERY_METHOD_OPTIONS.filter((value) =>
    methods.includes(value),
  );
  const unknown = methods.filter(
    (value) => !DELIVERY_METHOD_OPTIONS.includes(value),
  );
  return [...known, ...unknown].join(",");
}

/** The URL patch for `useUrlParams` — every key, so stale ones are dropped. */
export function orderFiltersToUrl(
  filters: OrderFilters,
): Record<string, string | undefined> {
  const patch: Record<string, string | undefined> = {
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    status: filters.status.length ? statusCsv(filters.status) : undefined,
    paymentStatus: filters.paymentStatus || undefined,
    paymentMethod: filters.paymentMethod || undefined,
    deliveryMethod: filters.deliveryMethod.length
      ? deliveryCsv(filters.deliveryMethod)
      : undefined,
    pickupPointId: filters.pickupPointId || undefined,
  };
  for (const param of SIGNAL_PARAMS) {
    patch[param] = filters.signals.includes(param) ? "true" : undefined;
  }
  return patch;
}

/**
 * The API's query for these filters (no page, size or sort). `|| undefined`
 * throughout, so an unset filter leaves the param off the request entirely
 * and the query key stays the one an unfiltered list already cached.
 */
export function orderFiltersToQuery(
  filters: OrderFilters,
  search: string,
): AdminOrderControllerFindAllParams {
  const query: AdminOrderControllerFindAllParams = {
    // A plain string (CSV) since TASK-250: one or several statuses.
    status: filters.status.length ? statusCsv(filters.status) : undefined,
    search: search || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    // Cast: the value comes off the URL as a string, and an illegal one is
    // rejected by the DTO rather than pretended away here.
    paymentStatus: (filters.paymentStatus ||
      undefined) as AdminOrderControllerFindAllParams["paymentStatus"],
    paymentMethod: (filters.paymentMethod ||
      undefined) as AdminOrderControllerFindAllParams["paymentMethod"],
    // TASK-648: a CSV like `status`; an unknown method is the DTO's to refuse.
    deliveryMethod: filters.deliveryMethod.length
      ? deliveryCsv(filters.deliveryMethod)
      : undefined,
    pickupPointId: filters.pickupPointId || undefined,
  };
  for (const param of filters.signals) {
    query[param] = true;
  }
  return query;
}

/* ── Period ─────────────────────────────────────────────────────────────── */

export const PERIOD_PRESETS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "today", label: d.periodToday },
  { id: "yesterday", label: d.periodYesterday },
  { id: "7d", label: d.period7Days },
  { id: "30d", label: d.period30Days },
  { id: "month", label: d.periodMonth },
  { id: "custom", label: d.periodCustom },
];

/** The range a preset stands for, counted from Kyiv's `today`. */
export function periodRange(
  preset: string,
  today: string,
): { from: string; to: string } | null {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const day = shiftDay(today, -1);
      return { from: day, to: day };
    }
    case "7d":
      return { from: shiftDay(today, -6), to: today };
    case "30d":
      return { from: shiftDay(today, -29), to: today };
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today };
    default:
      return null;
  }
}

/** Which preset a range is — `custom` for any other range, `""` for none. */
export function presetOf(from: string, to: string, today: string): string {
  if (!from && !to) return "";
  for (const { id } of PERIOD_PRESETS) {
    const range = periodRange(id, today);
    if (range && range.from === from && range.to === to) return id;
  }
  return "custom";
}

const dayMonth = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
const fullDay = (day: string) => `${dayMonth(day)}.${day.slice(0, 4)}`;

/** «01.09 – 24.09.2026», «з 01.09.2026», «до 24.09.2026». */
export function periodLabel(from: string, to: string): string {
  if (from && to) {
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    return `${sameYear ? dayMonth(from) : fullDay(from)} – ${fullDay(to)}`;
  }
  if (from) return d.periodSince(fullDay(from));
  return d.periodUntil(fullDay(to));
}

/* ── Chips ──────────────────────────────────────────────────────────────── */

export interface OrderFilterChip {
  key: string;
  label: string;
  /** What removing the chip writes to the URL. */
  clear: Record<string, undefined>;
}

/**
 * One chip per applied filter. The status chip only when the status is not a
 * quick view — then the highlighted view already says it.
 *
 * `pickupPointNames` (id → name) comes from `GET /admin/pickup-points`, which
 * needs `settings:delivery`: without it — or before it answers, or for a point
 * since deleted — the chip says «Точка самовивозу» rather than show an id.
 */
export function orderFilterChips(
  filters: OrderFilters,
  pickupPointNames: Readonly<Record<string, string>> = {},
): OrderFilterChip[] {
  const chips: OrderFilterChip[] = [];
  if (filters.dateFrom || filters.dateTo) {
    chips.push({
      key: "period",
      label: d.chipPeriod(periodLabel(filters.dateFrom, filters.dateTo)),
      clear: { dateFrom: undefined, dateTo: undefined },
    });
  }
  if (
    filters.status.length &&
    !activeQuickView(statusCsv(filters.status)) &&
    !activeQuickView(filters.status.join(","))
  ) {
    chips.push({
      key: "status",
      label: d.chipStatus(filters.status.map(orderStatusLabel).join(", ")),
      clear: { status: undefined },
    });
  }
  if (filters.paymentStatus) {
    chips.push({
      key: "paymentStatus",
      label: d.chipPaymentStatus(paymentStatusLabel(filters.paymentStatus)),
      clear: { paymentStatus: undefined },
    });
  }
  if (filters.paymentMethod) {
    chips.push({
      key: "paymentMethod",
      label: d.chipPaymentMethod(paymentMethodLabel(filters.paymentMethod)),
      clear: { paymentMethod: undefined },
    });
  }
  if (filters.deliveryMethod.length) {
    chips.push({
      key: "deliveryMethod",
      label: d.chipDelivery(
        deliveryCsv(filters.deliveryMethod)
          .split(",")
          .map(deliveryFilterLabel)
          .join(", "),
      ),
      clear: { deliveryMethod: undefined },
    });
  }
  if (filters.pickupPointId) {
    const name = pickupPointNames[filters.pickupPointId];
    chips.push({
      key: "pickupPointId",
      label: name ? d.chipPickupPoint(name) : d.chipPickupPointUnknown,
      clear: { pickupPointId: undefined },
    });
  }
  for (const param of filters.signals) {
    chips.push({
      key: param,
      label: SIGNAL_LABELS[param].label,
      clear: { [param]: undefined },
    });
  }
  return chips;
}

/** Anything but the status narrows the list (for the empty state's wording). */
export function hasNonStatusFilters(filters: OrderFilters): boolean {
  return Boolean(
    filters.dateFrom ||
    filters.dateTo ||
    filters.paymentStatus ||
    filters.paymentMethod ||
    filters.deliveryMethod.length ||
    filters.pickupPointId ||
    filters.signals.length,
  );
}
