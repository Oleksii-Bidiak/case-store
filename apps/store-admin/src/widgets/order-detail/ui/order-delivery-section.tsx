"use client";

import type { ReactNode } from "react";
import {
  deliveryMethodLabel,
  deliverySnapshot,
  isShippingCostPending,
  orderDeliveryMethod,
  type OrderEntity,
} from "@/entities/order";
import { useGetDeliverySettings } from "@/entities/delivery";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { OrderDetailsForm } from "@/features/order-details-form";
import { OrderAddressForm } from "@/features/order-address-edit";
import { Badge, Callout, Separator } from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatCurrency, formatUAPhone, isValidUAPhone } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";

const d = dict.orders;

const phoneText = (raw: string) =>
  isValidUAPhone(raw) ? formatUAPhone(raw) : raw;

const joined = (...parts: Array<string | undefined>) =>
  parts.filter(Boolean).join(", ");

/**
 * «Олена Шевченко, +380 50 123 4567» — the phone never breaks across lines,
 * so a narrow side column wraps before it rather than inside it.
 */
function withPhone(
  lead: string | undefined,
  separator: string,
  phone: string | undefined,
): ReactNode {
  if (!phone) return lead ?? "—";
  const number = <span className="whitespace-nowrap">{phoneText(phone)}</span>;
  return lead ? (
    <>
      {lead}
      {separator}
      {number}
    </>
  ) : (
    number
  );
}

interface Row {
  label: string;
  value: ReactNode;
}

/**
 * «Доставка» in the order card — ONE block for all four methods (TASK-648,
 * ДН-1.13): the title with the method's badge, then a label column of rows,
 * then the operator's tools that were in this card before.
 *
 *  - Нова Пошта  Отримувач · Куди · Вартість «70 ₴ — за тарифом НП»; the ТТН
 *                field below, as before.
 *  - Самовивіз   Отримувач · Точка · Адреса · Години · Вартість «Безкоштовно»,
 *                and why the point reads as it did at checkout. No ТТН field
 *                (unless the order somehow carries one — then it stays visible).
 *  - Курʼєр      Отримувач · Адреса · Вартість «150 ₴» or «Безкоштовно (від
 *                2 000 ₴)». The threshold is the CURRENT setting, read only
 *                with `settings:delivery`; the order snapshots none. No ТТН
 *                field (unless one is set) — the shop's courier has none.
 *  - Інша        at 0 the whole section in the warning tone; «Що вказав
 *                покупець», Вартість «не розрахована», and what the operator
 *                has to do. Once a cost is booked it is the API's rule
 *                (`isShippingCostPending`): plain tone, Вартість «90 ₴».
 *
 * The rows come from the delivery snapshot written at checkout — the pickup
 * point's name, address and hours as the buyer saw them — never from the
 * point's current record, which may since have been renamed or deleted.
 */
export function OrderDeliverySection({ order }: { order: OrderEntity }) {
  const { can } = useAuth();
  const method = orderDeliveryMethod(order);
  const pending = isShippingCostPending(order);
  const snap = deliverySnapshot(order.shippingAddress);
  const settings = useGetDeliverySettings({
    query: {
      enabled:
        method === "COURIER" &&
        Number(order.shippingCost) === 0 &&
        can(PERM.settingsDelivery),
    },
  });
  const courierFreeFrom = settings.data?.data?.courierFreeFrom;

  const recipientName = [snap.firstName, snap.lastName]
    .filter(Boolean)
    .join(" ");
  const recipient = withPhone(recipientName || undefined, ", ", snap.phone);

  const rows: Row[] = [{ label: d.deliveryRecipient, value: recipient }];
  if (pending) {
    rows.push(
      {
        label: d.deliveryBuyerWrote,
        value: joined(snap.address1, snap.city) || "—",
      },
      { label: d.deliveryCost, value: d.deliveryCostNotCalculated },
    );
  } else if (method === "OTHER") {
    // Quoted: the operator booked a cost, so it is a fact now, not a warning.
    rows.push(
      {
        label: d.deliveryBuyerWrote,
        value: joined(snap.address1, snap.city) || "—",
      },
      { label: d.deliveryCost, value: formatCurrency(order.shippingCost) },
    );
  } else if (method === "PICKUP") {
    rows.push(
      { label: d.deliveryPoint, value: snap.pickupPointName ?? "—" },
      {
        label: d.deliveryAddress,
        value:
          joined(snap.city, snap.pickupPointAddress ?? snap.address1) || "—",
      },
      {
        label: d.deliveryHours,
        value: withPhone(snap.pickupPointHours, " · ", snap.pickupPointPhone),
      },
      { label: d.deliveryCost, value: d.deliveryFree },
    );
  } else if (method === "COURIER") {
    const cost = Number(order.shippingCost);
    rows.push(
      {
        label: d.deliveryAddress,
        value: joined(snap.city, snap.address1, snap.address2) || "—",
      },
      {
        label: d.deliveryCost,
        value:
          cost > 0
            ? formatCurrency(order.shippingCost)
            : courierFreeFrom
              ? d.deliveryFreeFrom(formatCurrency(courierFreeFrom))
              : d.deliveryFree,
      },
    );
  } else {
    rows.push(
      {
        label: d.deliveryWhere,
        value: joined(snap.city, snap.npWarehouseName ?? snap.address1) || "—",
      },
      {
        label: d.deliveryCost,
        // 0 on an NP order means the buyer pays the carrier, not "free".
        value:
          Number(order.shippingCost) > 0
            ? d.deliveryCostNp(formatCurrency(order.shippingCost))
            : d.deliveryCostNpTariff,
      },
    );
  }

  return (
    <section
      aria-labelledby="order-delivery-heading"
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4",
        pending ? "border-warning/50 bg-warning/5" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          id="order-delivery-heading"
          className="text-sm font-semibold text-foreground"
        >
          {d.deliveryHeading}
        </h3>
        <Badge variant={pending ? "warning" : "secondary"}>
          {deliveryMethodLabel(method)}
        </Badge>
      </div>

      {/* A 140 px label column (ДН-1.13): `w-35` on the scale, not a value —
          once the block is at least 28rem wide. The card's side column at 1440
          is ~360 px, where 140 px of labels left ~170 px for the values and
          split «2 000 ₴)» over lines; there each label sits over its value. */}
      <dl className="@container flex flex-col gap-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col @md:flex-row @md:gap-3">
            <dt className="shrink-0 text-muted-foreground @md:w-35">
              {row.label}
            </dt>
            <dd className="min-w-0 flex-1 break-words text-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {method === "PICKUP" && !pending ? (
        <p className="text-xs text-muted-foreground">{d.deliveryPickupHint}</p>
      ) : null}
      {pending ? (
        <Callout variant="warning">{d.deliveryOtherWarning}</Callout>
      ) : null}

      {/* TASK-341: correctable until the parcel is with the courier. */}
      <OrderAddressForm order={order} />
      <Separator />
      {/* TASK-335 / 336: waybill + operator-only notes. The waybill is a
          Nova Poshta one (14 digits, NP tracking link): a pickup and the
          shop's own courier need none, so the field is left out there unless
          one was typed anyway. OTHER keeps it — an address outside the NP
          list is often sent by NP address delivery once quoted. */}
      <OrderDetailsForm
        order={order}
        showWaybill={
          (method !== "PICKUP" && method !== "COURIER") ||
          Boolean(order.trackingNumber)
        }
      />
    </section>
  );
}
