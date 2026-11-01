"use client";

import { useEffect, useId, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRightIcon } from "lucide-react";
import {
  ReturnChannel,
  returnOutcomeLabel,
  returnReasonHeading,
  returnStatusBadgeVariant,
  returnLinesValueKop,
  returnStatusLabel,
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
import { ReturnResolveForm } from "@/features/return-resolve";
import { ReturnRepairPanel } from "@/features/return-repair";
import { toast } from "@/shared/ui/toast";
import { Badge, RowActionsMenu, Stepper } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  countLabel,
  formatCurrency,
  formatDateTime,
  formatKop,
  formatUAPhone,
  isValidUAPhone,
  parseKop,
} from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import { returnSteps } from "../model/return-steps";
import { ReturnDatesCard } from "./return-dates-card";
import { ReturnDecisionCard } from "./return-decision-card";
import { ReturnDetailSkeleton } from "./return-detail-skeleton";
import { ReturnMoneyCard } from "./return-money-card";

const d = dict.returns;

interface ReturnDetailViewProps {
  returnId: string;
}

/** The «Рішення» card's anchor — the repair panel's hint links to it. */
const DECISION_ANCHOR_ID = "return-decision";

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
 * path as steps, what comes back, and ONE «Наступний крок» card beside it.
 * Below lg the decision comes straight after the steps (Р5) — the DOM order is
 * the phone's order, and the grid places the cards side by side from lg.
 *
 * Since R2 (TASK-2046) the money is its own card under the step — «Гроші за
 * заявкою»: «До повернення» (the server's figure, less the promo share), the
 * payouts from the order money journal and «Виплатити». The old client-side
 * ceilings («Уже повернуто», «Можна повернути максимум») are gone with the
 * amount field they bounded: the server computes what is owed, and caps a
 * payout by it and by what the order still holds.
 *
 * Since B-12 (TASK-1961, TASK-2044) the page also carries the three dates
 * «Подано / Вирішено / Повернуто на склад», what the customer asked for, and
 * the «Рішення» card — the decision with the reason the customer sees, its
 * author, date and history, and the decide form for a writer.
 *
 * Not drawn, because the API does not provide them (TASK-1056's API tails):
 * the add-on services that come back with a line (TASK-949).
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
          <ReturnDecisionCard rma={rma} id={DECISION_ANCHOR_ID} />
          <ReturnResolveForm rma={rma} money={<ReturnMoneyCard rma={rma} />} />
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <ReturnDatesCard rma={rma} />

          {/* TASK-2045 — renders only under a REPAIR decision. */}
          <ReturnRepairPanel rma={rma} decisionAnchorId={DECISION_ANCHOR_ID} />

          <RequestCard rma={rma} />

          <ItemsCard rma={rma} />
        </div>
      </div>
    </div>
  );
}

/* ── What the customer asked for, and why ──────────────────────────────── */

/**
 * «Чого хоче покупець» and the reason (TASK-2044, TASK-1961). The reason's
 * heading names its author: the customer's own words through the account or
 * the guest link, an operator's comment when the shop filed it for them.
 */
function RequestCard({ rma }: { rma: ReturnEntity }) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
    >
      <dl className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <dt className="text-muted-foreground">{d.requestedOutcome}</dt>
        <dd
          className={cn(
            "font-medium",
            rma.requestedOutcome ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {returnOutcomeLabel(rma.requestedOutcome)}
        </dd>
      </dl>
      {/* TASK-1963 (AD-RET-15): who filed it for the buyer — the name, not just
          the fact; a deleted account leaves only the fact. */}
      {rma.channel === ReturnChannel.OPERATOR ? (
        <p className="text-sm text-muted-foreground">
          {rma.createdBy
            ? d.createdByOperatorName(rma.createdBy.name)
            : d.createdByOperator}
        </p>
      ) : null}
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-sm font-semibold text-foreground">
          {returnReasonHeading(rma.channel)}
        </h3>
        <p
          className={cn(
            "text-sm break-words whitespace-pre-line",
            rma.reason ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {rma.reason ?? d.noReason}
        </p>
      </div>
    </section>
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

function ItemsCard({ rma }: { rma: ReturnEntity }) {
  const headingId = useId();
  const units = rma.items.reduce((sum, item) => sum + item.quantity, 0);
  // Integer kopecks (R2): the gross value of the lines. What is owed back —
  // less the promo share — is «До повернення» on the money card.
  const returnedValueKop = returnLinesValueKop(rma.items);
  const lineSum = (price: string | null, quantity: number) => {
    const unitKop = price === null ? null : parseKop(price);
    return unitKop === null ? "—" : formatKop(unitKop * quantity);
  };

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
          value={returnedValueKop === null ? "—" : formatKop(returnedValueKop)}
          strong
        />
      </div>
    </section>
  );
}
