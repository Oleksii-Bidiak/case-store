"use client";

import { useEffect, useId, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRightIcon } from "lucide-react";
import {
  ReturnEntityStatus,
  returnStatusBadgeVariant,
  returnStatusLabel,
  useAdminOrderReturnControllerFindForOrder,
  useAdminReturnControllerFindById,
  type ReturnEntity,
} from "@/entities/return";
import {
  OrderNumber,
  formatOrderNumber,
  useAdminOrderControllerFindById,
  type OrderEntity,
} from "@/entities/order";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import {
  ReturnResolveForm,
  orderBalanceOf,
  returnedValueOf,
} from "@/features/return-resolve";
import { toast } from "@/shared/ui/toast";
import { Badge, RowActionsMenu, Stepper } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  countLabel,
  formatCurrency,
  formatDateTime,
  formatUAPhone,
  isValidUAPhone,
} from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import { returnSteps } from "../model/return-steps";
import { ReturnDetailSkeleton } from "./return-detail-skeleton";

const d = dict.returns;

interface ReturnDetailViewProps {
  returnId: string;
}

/** Kopiykas, so a sum of «29.99» lines does not drift. */
const toCents = (value: string) => Math.round(Number(value) * 100);
const fromCents = (cents: number) => (cents / 100).toFixed(2);

/** «Оксана Шевченко · +380 50 318 22 47» — from the order, when it was read. */
function clientLine(order: OrderEntity | undefined): string | null {
  if (!order) return null;
  const phone = (raw: string | null | undefined) =>
    raw ? (isValidUAPhone(raw) ? formatUAPhone(raw) : raw) : null;
  if (order.guest) {
    return [order.guest.name, phone(order.guest.phone)]
      .filter(Boolean)
      .join(" · ");
  }
  if (order.customer) {
    const name = [order.customer.firstName, order.customer.lastName]
      .filter(Boolean)
      .join(" ");
    const shipping = (order.shippingAddress ?? {}) as Record<string, unknown>;
    const shippingPhone =
      typeof shipping.phone === "string" ? shipping.phone : null;
    return [name || order.customer.email, phone(shippingPhone)]
      .filter(Boolean)
      .join(" · ");
  }
  return null;
}

function copy(value: string, success: string) {
  const write = navigator.clipboard?.writeText(value);
  if (!write) {
    toast.error(d.copyFailed);
    return;
  }
  write.then(
    () => toast.success(success),
    () => toast.error(d.copyFailed),
  );
}

/**
 * One return in full (TASK-340), laid out as ReturnsProposal Р3–Р5 (wave 198,
 * TASK-1056): the header with the shared numbers (TASK-1038), the request's
 * path as steps, what comes back with the ceiling «Можна повернути максимум»
 * (TASK-959), and ONE «Наступний крок» card beside it. Below lg the decision
 * comes straight after the steps (Р5) — the DOM order is the phone's order,
 * and the grid places the cards side by side from lg.
 *
 * The ceiling needs two reads the return itself does not carry: the order's
 * other returns (`returns:read`, which this page already requires) and the
 * order's total (`orders:read`). Without the latter the card prints the sum of
 * the lines and what was already refunded, and no maximum it cannot know; the
 * server still enforces it, and its 400 lands under the amount field.
 *
 * Not drawn, because the API does not provide them (TASK-1056's API tails):
 * the request's history (who decided what, when — only the last decision's
 * date is stored), the add-on services that come back with a line (TASK-949),
 * and the refund method.
 */
export function ReturnDetailView({ returnId }: ReturnDetailViewProps) {
  const router = useRouter();
  const { can } = useAuth();
  const { data, isLoading, isError, error } =
    useAdminReturnControllerFindById(returnId);
  const rma = data?.data;

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/returns");
    }
  }, [isNotFound, router]);

  const orderId = rma?.orderId ?? "";
  const siblingsQuery = useAdminOrderReturnControllerFindForOrder(orderId, {
    query: { enabled: Boolean(orderId) },
  });
  const orderQuery = useAdminOrderControllerFindById(orderId, {
    query: { enabled: Boolean(orderId) && can(PERM.ordersRead) },
  });

  if (isLoading) {
    return <ReturnDetailSkeleton />;
  }

  if (isError && !isNotFound) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {d.loadOneError}
      </p>
    );
  }

  if (!rma) {
    return null;
  }

  const order = orderQuery.data?.data;
  // Every OTHER return counts, whatever its status — REJECTED included, as the
  // API counts it (see `orderBalanceOf`).
  const otherRefunds = siblingsQuery.data?.data
    ? siblingsQuery.data.data
        .filter((other) => other.id !== rma.id)
        .map((other) => other.refundedAmount)
    : null;
  const orderBalance =
    order && otherRefunds ? orderBalanceOf(order.total, otherRefunds) : null;

  const client = clientLine(order);
  const orderHref = `/orders/${rma.orderId}`;
  const number = formatOrderNumber(rma.id);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/returns"
          className="w-fit rounded-xs text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {d.back}
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {d.heading}{" "}
            <span title={rma.id} className="font-mono">
              {number}
            </span>
          </h2>
          <RowActionsMenu
            label={d.cardActionsAria}
            items={[
              {
                label: d.rowCopyNumber,
                onSelect: () => copy(number, d.copiedNumber(number)),
              },
              { label: d.rowOpenOrder, href: orderHref },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <Badge variant={returnStatusBadgeVariant(rma.status)}>
            {returnStatusLabel(rma.status)}
          </Badge>
          <Link
            href={orderHref}
            className="inline-flex items-center gap-1 rounded-xs text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {d.viewOrder} <OrderNumber id={rma.orderId} />
            <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
          </Link>
          <span className="text-xs text-muted-foreground">
            {[client, d.submittedAt(formatDateTime(rma.requestedAt))]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      </header>

      <Stepper
        aria-label={d.stepsAria}
        steps={returnSteps(rma)}
        className="rounded-lg border bg-card p-3 shadow-card"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* First in the DOM: on a phone the decision follows the steps (Р5). */}
        <div className="flex flex-col gap-6 lg:col-start-3 lg:row-start-1">
          <ReturnResolveForm rma={rma} orderBalance={orderBalance} />
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <section className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-card">
            <h3 className="text-sm font-semibold text-foreground">
              {d.reason}
            </h3>
            <p
              className={cn(
                "text-sm break-words whitespace-pre-line",
                rma.reason ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {rma.reason ?? d.noReason}
            </p>
          </section>

          <ItemsCard
            rma={rma}
            otherRefunds={otherRefunds}
            orderBalance={orderBalance}
          />
        </div>
      </div>
    </div>
  );
}

/* ── «Що повертають» ────────────────────────────────────────────────────── */

function MoneyRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      data-row
      className={cn(
        "flex items-baseline justify-between gap-4",
        strong
          ? "border-t pt-2 font-semibold text-foreground"
          : "text-muted-foreground",
      )}
    >
      <span>{label}</span>
      <span className="text-foreground tabular-nums">{value}</span>
    </div>
  );
}

function ItemsCard({
  rma,
  otherRefunds,
  orderBalance,
}: {
  rma: ReturnEntity;
  otherRefunds: ReadonlyArray<string | null> | null;
  orderBalance: string | null;
}) {
  const headingId = useId();
  const units = rma.items.reduce((sum, item) => sum + item.quantity, 0);
  const returnedValue = returnedValueOf(rma.items);
  const alreadyRefunded = otherRefunds
    ? fromCents(
        otherRefunds.reduce(
          (sum, amount) => sum + (amount === null ? 0 : toCents(amount)),
          0,
        ),
      )
    : null;
  const maxRefund =
    orderBalance !== null && returnedValue !== null
      ? fromCents(Math.min(toCents(orderBalance), toCents(returnedValue)))
      : null;
  const lineSum = (price: string | null, quantity: number) =>
    price === null ? "—" : formatCurrency(fromCents(toCents(price) * quantity));

  const goodsAreBack =
    rma.status === ReturnEntityStatus.RECEIVED ||
    rma.status === ReturnEntityStatus.REFUNDED;

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-lg border bg-card shadow-card"
    >
      <div className="flex items-baseline justify-between gap-2 p-4">
        <h3 id={headingId} className="text-sm font-semibold text-foreground">
          {d.itemsHeading}
        </h3>
        <span className="text-xs text-muted-foreground">
          {d.itemsCount(countLabel(rma.items.length, d.itemLineForms), units)}
        </span>
      </div>

      {/* From md: a table. Below it: one block per line — the table used to
          scroll sideways on a phone. */}
      <table className="hidden w-full text-sm md:table">
        <thead className="bg-muted text-left">
          <tr className="border-y">
            <th className="h-10 px-4 font-medium">{d.itemProduct}</th>
            <th className="h-10 w-16 px-2 text-right font-medium">
              {d.itemQty}
            </th>
            <th className="h-10 w-28 px-2 text-right font-medium">
              {d.itemPrice}
            </th>
            <th className="h-10 w-28 px-4 text-right font-medium">
              {d.itemSum}
            </th>
          </tr>
        </thead>
        <tbody>
          {rma.items.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="px-4 py-2.5 text-foreground">
                {item.productName}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {item.quantity}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {item.price === null ? "—" : formatCurrency(item.price)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {lineSum(item.price, item.quantity)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="flex flex-col border-t md:hidden">
        {rma.items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-1 border-b px-4 py-2.5 text-sm"
          >
            <span className="text-foreground">{item.productName}</span>
            <span className="flex justify-between gap-2 text-muted-foreground tabular-nums">
              <span>
                {d.units(item.quantity)} ×{" "}
                {item.price === null ? "—" : formatCurrency(item.price)}
              </span>
              <span className="text-foreground">
                {lineSum(item.price, item.quantity)}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1.5 p-4 text-sm">
        <MoneyRow
          label={d.itemsTotal}
          value={returnedValue === null ? "—" : formatCurrency(returnedValue)}
        />
        {alreadyRefunded !== null ? (
          <MoneyRow
            label={d.alreadyRefunded}
            value={formatCurrency(alreadyRefunded)}
          />
        ) : null}
        {maxRefund !== null ? (
          <MoneyRow
            label={d.maxRefund}
            value={formatCurrency(maxRefund)}
            strong
          />
        ) : null}
        {rma.refundedAmount !== null ? (
          // Null is not zero — "nothing refunded yet" is no row at all.
          <MoneyRow
            label={d.refundedAmount}
            value={formatCurrency(rma.refundedAmount)}
            strong={maxRefund === null}
          />
        ) : null}
        {rma.restockedAt ? (
          <p className="pt-1 text-xs text-muted-foreground">
            {d.restockedAt} · {formatDateTime(rma.restockedAt)}
          </p>
        ) : goodsAreBack ? (
          <p className="pt-1 text-xs text-muted-foreground">{d.notRestocked}</p>
        ) : null}
      </div>
    </section>
  );
}
