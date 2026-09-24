"use client";

import Link from "next/link";
import {
  returnStatusBadgeVariant,
  returnStatusLabel,
  useAdminOrderReturnControllerFindForOrder,
} from "@/entities/return";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { Badge } from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";

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
        <ul className="flex flex-col gap-2">
          {returns.map((rma) => {
            const byOperator =
              rma.createdByUserId != null &&
              rma.createdByUserId !== orderUserId;
            return (
              <li
                key={rma.id}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <Link
                  href={`/returns/${rma.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {dict.returns.title(rma.id.slice(0, 8))}
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
                  <Badge variant="secondary">
                    {dict.returns.createdByOperator}
                  </Badge>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
