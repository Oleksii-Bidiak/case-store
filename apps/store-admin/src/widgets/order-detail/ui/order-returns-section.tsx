"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  returnDecisionLabel,
  returnStatusBadgeVariant,
  returnStatusLabel,
  useAdminOrderReturnControllerFindForOrder,
  type ReturnEntity,
} from "@/entities/return";
import { formatOrderNumber } from "@/entities/order";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { Badge } from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";

const d = dict.returns;

/**
 * The reason the customer reads, or why there is none: «до B-12» for a
 * decision the backfill inferred (nobody wrote a reason then), «Без причини»
 * for an approval given without one. Same rule as the /returns/[id] card.
 */
function decisionReasonOf(rma: ReturnEntity): ReactNode {
  if (rma.decisionReason) return rma.decisionReason;
  if (rma.decisionLegacy) {
    return (
      <Badge
        variant="outline"
        title={d.decisionLegacyHint}
        className="font-normal text-muted-foreground"
      >
        {d.decisionLegacyMarker}
      </Badge>
    );
  }
  return d.decisionNoReason;
}

/**
 * TASK-1962 (B-12 §1) — the decision in one glance: what, when, and what the
 * customer was told. Everything comes from the list response, so the card
 * still asks one request for all its returns.
 */
function ReturnDecisionSummary({ rma }: { rma: ReturnEntity }) {
  if (rma.decision == null) {
    return <p className="text-muted-foreground">{d.decisionNone}</p>;
  }
  return (
    <dl className="flex flex-col gap-0.5">
      <div className="flex flex-wrap gap-x-2">
        <dt className="text-muted-foreground">{d.decisionHeading}</dt>
        <dd className="font-medium text-foreground">
          {returnDecisionLabel(rma.decision)}
          {rma.decidedAt ? (
            <span className="font-normal text-muted-foreground">
              {" · "}
              {d.dateDecided} {formatDateTime(rma.decidedAt)}
            </span>
          ) : null}
        </dd>
      </div>
      <div className="flex flex-wrap gap-x-2">
        <dt className="text-muted-foreground">
          {d.decisionReason} · {d.decisionReasonHint}
        </dt>
        <dd className="min-w-0 break-words whitespace-pre-line text-foreground">
          {decisionReasonOf(rma)}
        </dd>
      </div>
    </dl>
  );
}

interface OrderReturnsSectionProps {
  orderId: string;
  /** The buyer's account, or null for a guest order — see `createdByOperator`. */
  orderUserId: string | null | undefined;
}

/**
 * The order's return requests, on the order card (TASK-724).
 *
 * `GET /admin/orders/:id/returns` existed since TASK-469 and the card never
 * showed what it answers: an operator on the phone with a buyer could not see
 * that a return was already open without going to the queue and searching.
 * Each request links to its own page, where the decision is taken.
 *
 * TASK-1962: each row also carries its lines with quantities, the decision,
 * its date and the reason the customer sees, and names the return the way its
 * own page header does (`formatOrderNumber`) — all from the same list request.
 *
 * Asked only with `returns:read` — the whole endpoint sits behind it — and not
 * rendered at all without it. The query key is the one `OrderStatusSelect`
 * already uses for its "is there a return yet?" question, so React Query issues
 * one request for both.
 *
 * «Заявку створив оператор» marks a request the shop filed on the buyer's
 * behalf: somebody other than the order's own account opened it. On a guest
 * order (`userId` null) any author is an operator — a guest has no account to
 * file one with.
 */
export function OrderReturnsSection({
  orderId,
  orderUserId,
}: OrderReturnsSectionProps) {
  const { can } = useAuth();
  const canReadReturns = can(PERM.returnsRead);
  const { data, isLoading, isError } =
    useAdminOrderReturnControllerFindForOrder(orderId, {
      query: { enabled: canReadReturns },
    });

  if (!canReadReturns) return null;

  const returns = data?.data ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {dict.orders.returnsForOrder}
      </h3>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{dict.common.loading}</p>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.orders.returnsForOrderLoadError}
        </p>
      ) : returns.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {dict.orders.returnsForOrderEmpty}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {returns.map((rma) => {
            const byOperator =
              rma.createdByUserId != null &&
              rma.createdByUserId !== orderUserId;
            const number = formatOrderNumber(rma.id);
            return (
              <li
                key={rma.id}
                className="flex flex-col gap-2 py-3 text-sm first:pt-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/returns/${rma.id}`}
                    className="rounded-xs font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {d.heading}{" "}
                    <span title={rma.id} className="font-mono">
                      {number}
                    </span>
                  </Link>
                  <Badge variant={returnStatusBadgeVariant(rma.status)}>
                    {returnStatusLabel(rma.status)}
                  </Badge>
                  <span className="text-muted-foreground">
                    {dict.orders.returnsForOrderRequestedAt(
                      formatDateTime(rma.requestedAt),
                    )}
                  </span>
                  {byOperator ? (
                    <Badge variant="secondary">{d.createdByOperator}</Badge>
                  ) : null}
                </div>
                {rma.items.length > 0 ? (
                  <ul
                    aria-label={dict.orders.returnsForOrderItemsAria(number)}
                    className="flex flex-col gap-0.5 text-foreground"
                  >
                    {rma.items.map((line) => (
                      <li key={line.id}>
                        {dict.orders.returnsForOrderLine(
                          line.productName,
                          line.quantity,
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <ReturnDecisionSummary rma={rma} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
