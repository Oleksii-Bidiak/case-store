"use client";

import {
  paymentAttemptStatusBadgeVariant,
  paymentAttemptStatusLabel,
  useAdminListOrderPayments,
} from "@/entities/payment";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { Badge } from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatCurrency, formatDateTime } from "@/shared/lib";
import { OPERATIONAL_LIST_QUERY } from "@/shared/lib/query-freshness";

interface OrderPaymentAttemptsProps {
  orderId: string;
  /** The list's own id — the «Оплата» block's disclosure points at it. */
  id?: string;
}

const t = dict.orders;

/**
 * The order's LiqPay attempts, read-only (TASK-371 → R2).
 *
 * Since R2 money moves only through the order's money journal (the «Оплата»
 * block): a LiqPay refund is «Повернути гроші → Через LiqPay» there, so the
 * per-attempt refund button is gone. What stays is the evidence — status,
 * amount, the provider's id and refusal — folded inside the block and fetched
 * only once it is unfolded.
 *
 * Exists only under `payments:read` — the class guard of the controller.
 * Newest attempt first, as the server returns them: a declined card followed by
 * a successful retry is the normal shape of a recovered payment.
 */
export function OrderPaymentAttempts({
  orderId,
  id,
}: OrderPaymentAttemptsProps) {
  const { can } = useAuth();
  const canRead = can(PERM.paymentsRead);

  const { data, isLoading, isError } = useAdminListOrderPayments(orderId, {
    query: { ...OPERATIONAL_LIST_QUERY, enabled: canRead },
  });

  if (!canRead) return null;

  return (
    <div id={id} className="flex flex-col gap-2">
      <h4 className="text-sm font-medium text-foreground">
        {t.paymentAttemptsHeading}
      </h4>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">
          {t.paymentAttemptsLoading}
        </p>
      ) : isError || !data ? (
        <p role="alert" className="text-xs text-destructive">
          {t.paymentAttemptsLoadError}
        </p>
      ) : data.data.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t.paymentAttemptsEmpty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.data.map((attempt) => (
            <li
              key={attempt.id}
              data-testid="payment-attempt"
              className="flex flex-col gap-2 rounded-md border border-border p-3 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={paymentAttemptStatusBadgeVariant(attempt.status)}
                >
                  {paymentAttemptStatusLabel(attempt.status)}
                </Badge>
                <span className="text-sm font-medium text-foreground tabular-nums">
                  {formatCurrency(attempt.amount)}
                </span>
              </div>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                <AttemptField
                  label={t.paymentAttemptCreatedAt}
                  value={formatDateTime(attempt.createdAt)}
                />
                {attempt.settledAt ? (
                  <AttemptField
                    label={t.paymentAttemptSettledAt}
                    value={formatDateTime(attempt.settledAt)}
                  />
                ) : null}
                {attempt.providerPaymentId ? (
                  <AttemptField
                    label={t.paymentAttemptProviderId}
                    value={attempt.providerPaymentId}
                    mono
                  />
                ) : null}
                {attempt.failureCode || attempt.failureMessage ? (
                  <AttemptField
                    label={t.paymentAttemptFailure}
                    value={[attempt.failureCode, attempt.failureMessage]
                      .filter(Boolean)
                      .join(" — ")}
                  />
                ) : null}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AttemptField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd
        className={
          mono ? "font-mono break-all text-foreground" : "text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}
