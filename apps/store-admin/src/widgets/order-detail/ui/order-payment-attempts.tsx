"use client";

import { OrderEntityPaymentMethod, type OrderEntity } from "@/entities/order";
import {
  isRefundableAttempt,
  paymentAttemptStatusBadgeVariant,
  paymentAttemptStatusLabel,
  useAdminListOrderPayments,
  type PaymentEntity,
} from "@/entities/payment";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { RefundPaymentButton } from "@/features/order-payment-refund";
import { Badge } from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatCurrency, formatDateTime } from "@/shared/lib";
import { OPERATIONAL_LIST_QUERY } from "@/shared/lib/query-freshness";

interface OrderPaymentAttemptsProps {
  order: Pick<OrderEntity, "id" | "paymentMethod">;
}

const t = dict.orders;

/**
 * The payment card's history of LiqPay attempts, with the refund action on each
 * successful one (TASK-371).
 *
 * Before this the card rendered a placeholder: the server side
 * (`AdminPaymentController`) was ready, the screen was not, and `REFUNDED` in the
 * admin was a label that moved no money (edge case E-12).
 *
 * - Exists only under `payments:read` — the class guard of the controller. A
 *   session without it sees the card's money summary and nothing about attempts.
 * - Newest attempt first, as the server returns them: a declined card followed
 *   by a successful retry is the normal shape of a recovered payment.
 * - «Повернути кошти» only on a SUCCEEDED attempt (anything else answers 409)
 *   and only with `payments:refund`.
 * - An order paid on delivery has no online attempts at all — the card says so
 *   instead of asking the server for an empty list, and points at the return
 *   request, which is where that money goes back.
 */
export function OrderPaymentAttempts({ order }: OrderPaymentAttemptsProps) {
  const { can } = useAuth();
  const canRead = can(PERM.paymentsRead);
  const canRefund = can(PERM.paymentsRefund);
  const isOnDelivery =
    order.paymentMethod === OrderEntityPaymentMethod.ON_DELIVERY;

  const { data, isLoading, isError } = useAdminListOrderPayments(order.id, {
    query: { ...OPERATIONAL_LIST_QUERY, enabled: canRead && !isOnDelivery },
  });

  if (!canRead) return null;

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium text-foreground">
        {t.paymentAttemptsHeading}
      </h4>
      <AttemptsBody
        orderId={order.id}
        isOnDelivery={isOnDelivery}
        isLoading={isLoading}
        isError={isError}
        attempts={data?.data}
        canRefund={canRefund}
      />
    </div>
  );
}

function AttemptsBody({
  orderId,
  isOnDelivery,
  isLoading,
  isError,
  attempts,
  canRefund,
}: {
  orderId: string;
  isOnDelivery: boolean;
  isLoading: boolean;
  isError: boolean;
  attempts: PaymentEntity[] | undefined;
  canRefund: boolean;
}) {
  if (isOnDelivery) {
    return (
      <p className="text-xs text-muted-foreground">
        {t.paymentAttemptsOnDelivery}
      </p>
    );
  }
  if (isLoading) {
    return (
      <p className="text-xs text-muted-foreground">
        {t.paymentAttemptsLoading}
      </p>
    );
  }
  if (isError || !attempts) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {t.paymentAttemptsLoadError}
      </p>
    );
  }
  if (attempts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{t.paymentAttemptsEmpty}</p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {attempts.map((attempt) => (
        <li
          key={attempt.id}
          data-testid="payment-attempt"
          className="flex flex-col gap-2 rounded-md border border-border p-3 text-xs"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={paymentAttemptStatusBadgeVariant(attempt.status)}>
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
            {/* `settledAt` is an ISO string on the wire; the generated type
                says `object` because the entity's swagger decorator omits
                `type: String` on a nullable Date. */}
            {typeof attempt.settledAt === "string" ? (
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
          {canRefund && isRefundableAttempt(attempt.status) ? (
            <RefundPaymentButton orderId={orderId} payment={attempt} />
          ) : null}
        </li>
      ))}
    </ul>
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
          mono ? "break-all font-mono text-foreground" : "text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}
