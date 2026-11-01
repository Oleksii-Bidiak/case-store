"use client";

import { useId } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminOrderReturnControllerFindForOrderQueryKey,
  getAdminReturnControllerFindAllQueryKey,
  getAdminReturnControllerFindByIdQueryKey,
  ReturnDecision,
  ReturnEntityStatus,
  type ReturnEntity,
} from "@/entities/return";
import {
  getAdminOrderControllerFindAllQueryKey,
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetAllowedTransitionsQueryKey,
  getAdminOrderControllerGetHistoryQueryKey,
  getAdminOrderMoneyControllerGetQueryKey,
  MoneyDirection,
  MoneyEntryKind,
  MoneyProviderState,
  moneyKindLabel,
  payoutKindLabel,
  returnPayoutDueKop,
  useAdminOrderMoneyControllerGet,
  type AdminOrderMoneyResponse,
  type MoneyOutKind,
  type OrderMoneyEntity,
  type OrderMoneyEntryEntity,
} from "@/entities/order";
import { getAdminDashboardControllerGetNeedsActionQueryKey } from "@/entities/dashboard";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { RecordPayoutAction } from "@/features/order-money-payout";
import { EntryCorrectionAction } from "@/features/order-money-reversal";
import { ReduceCreditAction } from "@/features/return-credit-reduce";
import { Badge } from "@/shared/ui";
import { dict } from "@/shared/config";
import { cn, formatDateTime, formatKop } from "@/shared/lib";
import { OPERATIONAL_LIST_QUERY } from "@/shared/lib/query-freshness";

const r = dict.returnMoney;
const m = dict.orderMoney;

/** The return statuses the card speaks for: decided, and not refused. */
const MONEY_STATUSES: readonly string[] = [
  ReturnEntityStatus.APPROVED,
  ReturnEntityStatus.RECEIVED,
  ReturnEntityStatus.REFUNDED,
];

/**
 * «Гроші за заявкою» (R2, TASK-2046) — the money of ONE return, on its page.
 *
 * Replaces «Сума повернення» + «Гроші повернуто» of the resolve form, which
 * recorded a figure on the return that the order never saw. Now:
 *
 * - «До повернення X» — the server's credit (the returned lines less their
 *   promo share), with «Зменшити» (reduce-only, with a reason; the reason is
 *   shown once set).
 * - «Виплачено Y» and the payouts of this return — entries of the ORDER money
 *   journal carrying this `returnId`, with who / when / how, the reversed /
 *   voided / «Очікує підтвердження LiqPay» markers and «Сторнувати».
 * - «Винні покупцю Z» and «Виплатити» while money is still due — prefilled
 *   with what is due, editable: a return is paid out in parts. What is due is
 *   what is owed on the return capped by what the order still holds; an unpaid
 *   order returns goods, not money, and says so.
 *
 * The return becomes «Гроші повернуто» by itself once its payouts cover the
 * credit, and goes back to «Товар отримано» when one is reversed — so every
 * write refreshes the return, the order and the lists.
 *
 * Shown on a REFUND decision from approval on (before the goods arrive only
 * the credit: the server pays out on RECEIVED). The figures come from the
 * order's `GET …/money` (`orders:read`); without it, from the return itself,
 * with no journal.
 */
export function ReturnMoneyCard({ rma }: { rma: ReturnEntity }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const headingId = useId();
  const canReadOrder = can(PERM.ordersRead);
  const moneyQuery = useAdminOrderMoneyControllerGet(rma.orderId, {
    query: { ...OPERATIONAL_LIST_QUERY, enabled: canReadOrder },
  });

  if (
    rma.decision !== ReturnDecision.REFUND ||
    rma.creditKop == null ||
    !MONEY_STATUSES.includes(rma.status)
  ) {
    return null;
  }

  const money = canReadOrder ? moneyQuery.data?.data : undefined;
  const ledger = money?.returns.find((row) => row.returnId === rma.id);
  const creditKop = ledger?.creditKop ?? rma.creditKop;
  const paidOutKop = ledger?.paidOutKop ?? rma.paidOutKop ?? 0;
  const creditReason = ledger?.creditReason ?? rma.creditReason ?? null;
  const owedKop = ledger?.owedKop ?? Math.max(0, creditKop - paidOutKop);
  const goodsBack = rma.status !== ReturnEntityStatus.APPROVED;

  const onWritten = (fresh: OrderMoneyEntity | null) => {
    const moneyKey = getAdminOrderMoneyControllerGetQueryKey(rma.orderId);
    if (fresh) {
      queryClient.setQueryData<AdminOrderMoneyResponse>(moneyKey, {
        data: fresh,
      });
    } else {
      void queryClient.invalidateQueries({ queryKey: moneyKey });
    }
    // A payout or its reversal moves the return's derived status, the order's
    // balance and maybe its derived REFUNDED — every screen showing them.
    for (const queryKey of [
      getAdminReturnControllerFindByIdQueryKey(rma.id),
      getAdminReturnControllerFindAllQueryKey(),
      getAdminOrderReturnControllerFindForOrderQueryKey(rma.orderId),
      getAdminOrderControllerFindByIdQueryKey(rma.orderId),
      getAdminOrderControllerFindAllQueryKey(),
      getAdminOrderControllerGetHistoryQueryKey(rma.orderId),
      getAdminOrderControllerGetAllowedTransitionsQueryKey(rma.orderId),
      getAdminDashboardControllerGetNeedsActionQueryKey(),
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  return (
    <section
      id="return-money"
      aria-labelledby={headingId}
      className="flex scroll-mt-20 flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
    >
      <h3 id={headingId} className="text-sm font-semibold text-foreground">
        {r.heading}
      </h3>

      <dl className="flex flex-col gap-1.5 text-sm">
        {/* One dt with two dd: the amount and, once lowered, why. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <dt className="text-muted-foreground">{r.creditLabel}</dt>
          <dd className="flex items-baseline gap-2">
            <ReduceCreditAction
              rma={rma}
              creditKop={creditKop}
              paidOutKop={paidOutKop}
            />
            <span
              data-testid="return-credit"
              className="font-semibold text-foreground tabular-nums"
            >
              {formatKop(creditKop)}
            </span>
          </dd>
          {creditReason ? (
            <dd className="basis-full text-xs break-words whitespace-pre-line text-muted-foreground">
              {r.creditReason(creditReason)}
            </dd>
          ) : null}
        </div>
        {paidOutKop > 0 ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{r.paidOutLabel}</dt>
            <dd className="text-foreground tabular-nums">
              {formatKop(paidOutKop)}
            </dd>
          </div>
        ) : null}
      </dl>

      {!goodsBack ? (
        <p className="text-xs text-muted-foreground">{r.awaitingGoods}</p>
      ) : owedKop > 0 && money ? (
        <DueLine
          money={money}
          returnId={rma.id}
          owedKop={owedKop}
          onWritten={onWritten}
        />
      ) : null}

      {!canReadOrder ? (
        <p className="text-xs text-muted-foreground">{r.payoutsNoAccess}</p>
      ) : moneyQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">{r.loading}</p>
      ) : !money ? (
        <p role="alert" className="text-xs text-destructive">
          {r.loadError}
        </p>
      ) : (
        <Payouts money={money} returnId={rma.id} onWritten={onWritten} />
      )}
    </section>
  );
}

/**
 * «Винні покупцю Z» + «Виплатити», or why nothing can go out: an unpaid order
 * returns goods, not money; an order whose money already went back holds
 * nothing to pay with.
 */
function DueLine({
  money,
  returnId,
  owedKop,
  onWritten,
}: {
  money: OrderMoneyEntity;
  returnId: string;
  owedKop: number;
  onWritten: (fresh: OrderMoneyEntity | null) => void;
}) {
  const dueKop = returnPayoutDueKop({ owedKop }, money.totals);
  if (dueKop <= 0) {
    return (
      <p
        data-testid="return-money-nothing-due"
        className="text-sm text-muted-foreground"
      >
        {money.totals.paidKop === 0 ? r.unpaidOrder : r.nothingHeld}
      </p>
    );
  }
  return (
    <div
      data-testid="return-money-due"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/35 bg-warning/7 p-3"
    >
      <b className="text-sm font-semibold text-foreground tabular-nums">
        {r.owedToCustomer(formatKop(dueKop))}
      </b>
      <RecordPayoutAction
        money={money}
        onWritten={onWritten}
        forReturn={{ returnId, dueKop }}
      />
    </div>
  );
}

function entryName(entry: OrderMoneyEntryEntity): string {
  return `${moneyKindLabel(entry.kind)}, ${formatKop(entry.amountKop)}, ${formatDateTime(entry.occurredAt)}`;
}

/**
 * This return's payouts, oldest first. A reversal is not a row of its own
 * here — the payout it cancels stays, struck through and marked; the order's
 * journal keeps both.
 */
function Payouts({
  money,
  returnId,
  onWritten,
}: {
  money: OrderMoneyEntity;
  returnId: string;
  onWritten: (fresh: OrderMoneyEntity | null) => void;
}) {
  const headingId = useId();
  const payouts = money.entries.filter(
    (entry) =>
      entry.returnId === returnId &&
      entry.direction === MoneyDirection.OUT &&
      entry.reversalOfId === null,
  );

  return (
    <div className="flex flex-col gap-2">
      <h4 id={headingId} className="text-sm font-medium text-foreground">
        {r.payoutsHeading}
      </h4>
      {payouts.length === 0 ? (
        <p className="text-xs text-muted-foreground">{r.payoutsEmpty}</p>
      ) : (
        <ul aria-labelledby={headingId} className="flex flex-col gap-2">
          {payouts.map((entry) => (
            <PayoutRow
              key={entry.id}
              entry={entry}
              money={money}
              onWritten={onWritten}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PayoutRow({
  entry,
  money,
  onWritten,
}: {
  entry: OrderMoneyEntryEntity;
  money: OrderMoneyEntity;
  onWritten: (fresh: OrderMoneyEntity | null) => void;
}) {
  const reversed = entry.reversedById !== null;
  const voided = entry.voidedAt !== null;
  const requested =
    entry.providerState === MoneyProviderState.REQUESTED && !voided;
  const who =
    entry.actorName ??
    (entry.kind === MoneyEntryKind.LIQPAY_REFUND
      ? m.actorLiqPay
      : m.actorSystem);
  const name = entryName(entry);

  return (
    <li
      data-testid="return-payout"
      className="flex flex-col gap-1.5 rounded-md border border-border p-3 text-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "text-foreground",
            (reversed || voided) && "line-through",
          )}
        >
          {payoutKindLabel(entry.kind as MoneyOutKind)}
        </span>
        <span
          className={cn(
            "ml-auto text-sm font-semibold text-foreground tabular-nums",
            (reversed || voided) && "text-muted-foreground line-through",
          )}
        >
          {formatKop(entry.amountKop)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
        <span>{who}</span>
        <time dateTime={entry.occurredAt}>
          {formatDateTime(entry.occurredAt)}
        </time>
      </div>
      {entry.reason ? (
        <p className="whitespace-pre-wrap text-foreground">{entry.reason}</p>
      ) : null}
      {reversed || voided || requested ? (
        <div className="flex flex-wrap gap-1.5">
          {requested ? (
            <Badge variant="warning">{m.requestedChip}</Badge>
          ) : null}
          {reversed ? (
            <Badge variant="secondary">{r.reversedChip}</Badge>
          ) : null}
          {voided ? <Badge variant="secondary">{m.voidedChip}</Badge> : null}
        </div>
      ) : null}
      {voided && entry.voidReason ? (
        <p>{m.voidReason(entry.voidReason)}</p>
      ) : null}
      <div className="flex flex-wrap gap-1 empty:hidden">
        <EntryCorrectionAction
          mode="reverse"
          money={money}
          entry={entry}
          entryName={name}
          onWritten={onWritten}
        />
        <EntryCorrectionAction
          mode="void"
          money={money}
          entry={entry}
          entryName={name}
          onWritten={onWritten}
        />
      </div>
    </li>
  );
}
