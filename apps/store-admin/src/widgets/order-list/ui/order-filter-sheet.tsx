"use client";

import {
  orderStatusLabel,
  paymentStatusLabel,
  useAdminOrderControllerFacets,
  useAdminOrderControllerFindAll,
  type AdminOrderControllerFacetsParams,
} from "@/entities/order";
import { countLabel } from "@/shared/lib";
import {
  CheckList,
  DateRange,
  FilterSection,
  FilterSheet,
  PillGroup,
  useFilterDraft,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  DELIVERY_METHOD_OPTIONS,
  EMPTY_FILTERS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_OPTIONS,
  PERIOD_PRESETS,
  SIGNAL_LABELS,
  SIGNAL_PARAMS,
  STATUS_OPTIONS,
  deliveryFilterLabel,
  kyivToday,
  orderFiltersToQuery,
  periodRange,
  presetOf,
  type OrderFilters,
  type SignalParam,
} from "../model/order-filters";

const d = dict.orders;

interface OrderFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is applied now — the draft is reseeded from it on every open. */
  applied: OrderFilters;
  /** The committed search term: the count below must answer for it too. */
  search: string;
  onApply: (next: OrderFilters) => void;
}

/**
 * «Фільтри» of the order registry (OrdersProposal П6, П8 — a side sheet, the
 * whole screen below md). Everything the toolbar used to carry lives here with
 * the same URL params: the status, payment-status and payment-method selects,
 * and the six signal toggles; plus the period, which the API always filtered by
 * (`dateFrom`/`dateTo`, Kyiv days) and nothing on screen offered.
 *
 * «Спосіб доставки» (TASK-648, ДН-1.11) sits right after «Оплата»: a checkbox
 * per method with its count from `GET /admin/orders/facets`, asked with the
 * DRAFT — so ticking a status or a period moves the numbers before anything is
 * applied. The facets count every filter except the method itself, which is why
 * the method is left out of that request (and its cache key). The pickup point
 * (`?pickupPointId=`) is not a control here: it comes from the settings screen's
 * «Замовлення з цією точкою» and leaves by its chip — the draft carries it, so
 * applying the sheet keeps it.
 *
 * Not drawn, because `GET /admin/orders` cannot filter by them yet (API tails
 * of TASK-1045): the sum range, the customer type, «Без ТТН» and the
 * dashboard's new signals, and per-status counts.
 *
 * «Показати N замовлень» is the API's own count for the DRAFT — one `limit=1`
 * read while the sheet is open — so the button never promises a number the
 * list will not show.
 */
export function OrderFilterSheet({
  open,
  onOpenChange,
  applied,
  search,
  onApply,
}: OrderFilterSheetProps) {
  const { draft, update, reset } = useFilterDraft(applied, open);
  const today = kyivToday();
  const preset = presetOf(draft.dateFrom, draft.dateTo, today);

  const draftQuery = orderFiltersToQuery(draft, search);
  const probe = useAdminOrderControllerFindAll(
    { ...draftQuery, page: 1, limit: 1 },
    { query: { enabled: open } },
  );
  const found = probe.data?.meta?.total;

  const facets = useAdminOrderControllerFacets(
    {
      ...draftQuery,
      deliveryMethod: undefined,
    } as AdminOrderControllerFacetsParams,
    { query: { enabled: open } },
  );
  const deliveryCounts = facets.data?.data?.deliveryMethod as
    Record<string, number> | undefined;

  return (
    <FilterSheet
      open={open}
      onOpenChange={onOpenChange}
      applyLabel={
        found === undefined || probe.isFetching
          ? d.filtersApply
          : d.filtersApplyCount(countLabel(found, d.itemForms))
      }
      onApply={() => {
        onApply(draft);
        onOpenChange(false);
      }}
      onReset={() => reset(EMPTY_FILTERS)}
    >
      <FilterSection title={d.filterPeriod}>
        <DateRange
          legend={d.filterPeriod}
          presets={PERIOD_PRESETS}
          preset={preset}
          onPresetChange={(next) => {
            const range = periodRange(next, today);
            // «Свій період» keeps whatever is typed; it only says "custom".
            if (range) update({ dateFrom: range.from, dateTo: range.to });
          }}
          from={draft.dateFrom}
          to={draft.dateTo}
          onChange={({ from, to }) => update({ dateFrom: from, dateTo: to })}
        />
      </FilterSection>

      <FilterSection title={d.filterOrderStatus}>
        <CheckList
          label={d.filterStatusAria}
          columns={2}
          items={STATUS_OPTIONS.map((status) => ({
            value: status,
            label: orderStatusLabel(status),
          }))}
          value={draft.status}
          onChange={(status) => update({ status })}
        />
      </FilterSection>

      <FilterSection title={d.filterPayment}>
        <PillGroup
          label={d.filterPaymentStatusAria}
          value={draft.paymentStatus}
          onChange={(paymentStatus) => update({ paymentStatus })}
          options={[
            { value: "", label: d.allPaymentStatuses },
            ...PAYMENT_STATUS_OPTIONS.map((status) => ({
              value: status,
              label: paymentStatusLabel(status),
            })),
          ]}
        />
        <PillGroup
          label={d.filterPaymentMethodAria}
          value={draft.paymentMethod}
          onChange={(paymentMethod) => update({ paymentMethod })}
          options={[
            { value: "", label: d.allPaymentMethods },
            ...Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
      </FilterSection>

      <FilterSection title={d.filterDelivery}>
        <CheckList
          label={d.filterDeliveryAria}
          items={DELIVERY_METHOD_OPTIONS.map((method) => ({
            value: method,
            label: deliveryFilterLabel(method),
            count: deliveryCounts?.[method],
          }))}
          value={draft.deliveryMethod}
          onChange={(deliveryMethod) => update({ deliveryMethod })}
        />
      </FilterSection>

      <FilterSection title={d.filterSignals}>
        <CheckList
          label={d.filterSignals}
          items={SIGNAL_PARAMS.map((param) => ({
            value: param,
            label: SIGNAL_LABELS[param].label,
            description: SIGNAL_LABELS[param].description,
          }))}
          value={draft.signals}
          onChange={(signals) => update({ signals: signals as SignalParam[] })}
        />
      </FilterSection>
    </FilterSheet>
  );
}
