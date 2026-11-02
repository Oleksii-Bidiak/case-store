"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import {
  getAdminOrderControllerFindAllQueryKey,
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetAllowedTransitionsQueryKey,
  getAdminOrderControllerGetHistoryQueryKey,
  getAdminOrderMoneyControllerGetQueryKey,
  MoneyDirection,
  MoneyEntryKind,
  MoneyProviderState,
  moneyDueText,
  moneyKindLabel,
  OrderEntityPaymentMethod,
  OrderEntityStatus,
  OrderStatusHistoryEntityNote,
  paymentStatusBadgeVariant,
  paymentStatusLabel,
  useAdminOrderControllerGetHistory,
  useAdminOrderMoneyControllerGet,
  type AdminOrderMoneyResponse,
  type OrderEntity,
  type OrderMoneyEntity,
  type OrderMoneyEntryEntity,
  type OrderStatusHistoryEntity,
} from "@/entities/order";
import { getAdminDashboardControllerGetNeedsActionQueryKey } from "@/entities/dashboard";
import { getAdminListOrderPaymentsQueryKey } from "@/entities/payment";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { RecordReceiptAction } from "@/features/order-money-receipt";
import { RecordPayoutAction } from "@/features/order-money-payout";
import { EntryCorrectionAction } from "@/features/order-money-reversal";
import { Badge, Button, InfoHint } from "@/shared/ui";
import { dict } from "@/shared/config";
import { cn, formatDateTime, formatKop } from "@/shared/lib";
import { OPERATIONAL_LIST_QUERY } from "@/shared/lib/query-freshness";
import { OrderPaymentAttempts } from "./order-payment-attempts";

const m = dict.orderMoney;

/**
 * A LiqPay callback bumps the order's money and `updatedAt` at any moment —
 * the block re-reads on the card's own rhythm (TASK-629).
 */
const MONEY_REFETCH_MS = 60_000;

/** Methods whose money arrives through LiqPay attempts. */
const ONLINE_METHODS: readonly string[] = [
  OrderEntityPaymentMethod.ONLINE,
  OrderEntityPaymentMethod.INSTALLMENTS,
];

const SHIPPED_STATUSES: readonly string[] = [
  OrderEntityStatus.SHIPPED,
  OrderEntityStatus.DELIVERED,
];

const LIQPAY_KINDS: readonly string[] = [
  MoneyEntryKind.LIQPAY_PAYMENT,
  MoneyEntryKind.LIQPAY_REFUND,
];

interface OrderPaymentBlockProps {
  order: Pick<OrderEntity, "id" | "paymentStatus">;
  /** Opens the card's «Оформити повернення» dialog (TASK-1963). */
  onCreateReturn?: () => void;
}

/**
 * «Оплата» — the ONE place an order's money is read and moved (R2: TASK-1967,
 * TASK-1807, TASK-2047).
 *
 * Before R2 seven controls moved money or its labels from four sources that
 * did not see each other. Now there is a journal of entries on the order and
 * everything here is derived from it ON THE SERVER: the payment status, «Борг»
 * / «Винні покупцю», what may go back without a return. This block renders
 * those figures as they come (`GET …/money`) and never recomputes money.
 *
 * - Summary «Сплачено X з Y · Повернуто Z» plus the balance — always, for any
 *   reader of the order.
 * - What is due, worded by delivery (TASK-1807), with «Записати надходження»
 *   (`orders:write`).
 * - «Повернути гроші» (`payments:refund`) only while the server allows money
 *   back without a return; on a shipped order a pointer to the return instead.
 * - The journal: every entry with who and when; «Сторнувати» / «Анулювати
 *   запит» (`payments:correct`).
 * - LiqPay attempts, folded and read-only (`payments:read`).
 *
 * Every write answers with the fresh payload, which replaces the cached one;
 * the order card, its history, the list and the dashboard are invalidated
 * because the derived status and the lock token moved with it.
 */
export function OrderPaymentBlock({
  order,
  onCreateReturn,
}: OrderPaymentBlockProps) {
  const queryClient = useQueryClient();
  const headingId = useId();
  const moneyQuery = useAdminOrderMoneyControllerGet(order.id, {
    query: { ...OPERATIONAL_LIST_QUERY, refetchInterval: MONEY_REFETCH_MS },
  });
  // The same cache entry the timeline reads — the chips come from its notes.
  const history = useAdminOrderControllerGetHistory(order.id);
  const money = moneyQuery.data?.data;

  const onWritten = (fresh: OrderMoneyEntity | null) => {
    const moneyKey = getAdminOrderMoneyControllerGetQueryKey(order.id);
    if (fresh) {
      queryClient.setQueryData<AdminOrderMoneyResponse>(moneyKey, {
        data: fresh,
      });
    } else {
      void queryClient.invalidateQueries({ queryKey: moneyKey });
    }
    // The derived payment status, the order status (REFUNDED is derived too)
    // and the lock token the status menu sends back all moved.
    for (const queryKey of [
      getAdminOrderControllerFindByIdQueryKey(order.id),
      getAdminOrderControllerFindAllQueryKey(),
      getAdminOrderControllerGetHistoryQueryKey(order.id),
      getAdminOrderControllerGetAllowedTransitionsQueryKey(order.id),
      getAdminListOrderPaymentsQueryKey(order.id),
      getAdminDashboardControllerGetNeedsActionQueryKey(),
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  const paymentStatus = money?.paymentStatus ?? order.paymentStatus;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} className="text-sm font-semibold text-foreground">
          {m.heading}
        </h3>
        <Badge variant={paymentStatusBadgeVariant(paymentStatus)}>
          {paymentStatusLabel(paymentStatus)}
        </Badge>
      </div>

      {moneyQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">{m.loading}</p>
      ) : !money ? (
        <p role="alert" className="text-sm text-destructive">
          {m.loadError}
        </p>
      ) : (
        <MoneyBody
          money={money}
          history={history.data?.data}
          onWritten={onWritten}
          onCreateReturn={onCreateReturn}
        />
      )}
    </section>
  );
}

function MoneyBody({
  money,
  history,
  onWritten,
  onCreateReturn,
}: {
  money: OrderMoneyEntity;
  history: OrderStatusHistoryEntity[] | undefined;
  onWritten: (fresh: OrderMoneyEntity | null) => void;
  onCreateReturn?: () => void;
}) {
  const { can } = useAuth();
  const [attemptsOpen, setAttemptsOpen] = useState(false);
  const attemptsId = useId();
  const { totals } = money;

  const due = moneyDueText(money, formatKop(totals.balanceKop));
  // Money still held on a shipped order goes back through a return only —
  // unless part of it is an overpayment (`outWithoutReturnMaxKop > 0`).
  const viaReturnOnly =
    money.outWithoutReturnMaxKop <= 0 &&
    SHIPPED_STATUSES.includes(money.orderStatus) &&
    totals.paidKop > totals.refundedKop &&
    (can(PERM.paymentsRefund) || can(PERM.returnsWrite));
  const showAttempts =
    can(PERM.paymentsRead) && ONLINE_METHODS.includes(money.paymentMethod);

  return (
    <>
      <div
        role="group"
        aria-label={m.summaryAria}
        className="flex flex-col gap-1 text-sm"
      >
        <p className="text-foreground tabular-nums">
          {m.paidOf(formatKop(totals.paidKop), formatKop(totals.totalKop))}
          {totals.refundedKop > 0 ? (
            <>
              <span aria-hidden="true"> · </span>
              <span className="sr-only">, </span>
              {m.refunded(formatKop(totals.refundedKop))}
            </>
          ) : null}
        </p>
        {totals.balanceKop > 0 ? (
          // «Борг» is a DELIVERED order that still owes — the header mark and
          // the server's `hasDebt` say the same (TASK-1968). Before that the
          // same figure is simply what is still to pay.
          money.orderStatus === OrderEntityStatus.DELIVERED ? (
            <p className="font-semibold text-destructive tabular-nums">
              {m.debt(formatKop(totals.balanceKop))}
            </p>
          ) : (
            <p className="font-medium text-foreground tabular-nums">
              {m.toPay(formatKop(totals.balanceKop))}
            </p>
          )
        ) : totals.balanceKop < 0 ? (
          <p className="font-semibold text-warning tabular-nums">
            {/* The sign is the server's way of saying "we owe"; the operator
                reads the amount owed, unsigned. */}
            {m.owedToCustomer(formatKop(-totals.balanceKop))}
          </p>
        ) : null}
      </div>

      <MoneyChips money={money} history={history} />

      {due ? (
        <div
          data-testid="money-due"
          className="flex flex-wrap items-center gap-3 rounded-md border border-warning/35 bg-warning/7 p-3 text-sm"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <b className="font-semibold text-foreground">{due.title}</b>
            <span className="text-xs text-muted-foreground">{due.hint}</span>
          </div>
          <RecordReceiptAction money={money} onWritten={onWritten} primary />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {due ? null : (
          <RecordReceiptAction money={money} onWritten={onWritten} />
        )}
        <RecordPayoutAction money={money} onWritten={onWritten} />
      </div>

      {viaReturnOnly ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{m.payoutViaReturn}</span>
          {can(PERM.returnsWrite) && onCreateReturn ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={onCreateReturn}
            >
              {m.payoutViaReturnAction}
            </Button>
          ) : (
            <span>{m.payoutViaReturnNoAccess}</span>
          )}
        </div>
      ) : null}

      <MoneyJournal money={money} onWritten={onWritten} />

      {showAttempts ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            aria-expanded={attemptsOpen}
            aria-controls={attemptsId}
            onClick={() => setAttemptsOpen((value) => !value)}
          >
            {attemptsOpen ? (
              <ChevronUpIcon aria-hidden="true" />
            ) : (
              <ChevronDownIcon aria-hidden="true" />
            )}
            {attemptsOpen ? m.attemptsHide : m.attemptsShow}
          </Button>
          {attemptsOpen ? (
            <OrderPaymentAttempts orderId={money.orderId} id={attemptsId} />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/**
 * Two history flags the operator must act on:
 *
 * - `PROVIDER_REFUND_UNMATCHED` (TASK-1500) — LiqPay reported a refund the
 *   journal never asked for (made in the LiqPay cabinet). It writes no money;
 *   the operator records it. Shown until a payout is written after the note.
 * - `LEGACY_MONEY_UNKNOWN` — the R2 backfill found a refund label with no sum
 *   behind it. Shown while nothing has been paid out — the server keeps the
 *   label on the same condition.
 */
function MoneyChips({
  money,
  history,
}: {
  money: OrderMoneyEntity;
  history: OrderStatusHistoryEntity[] | undefined;
}) {
  if (!history) return null;

  const lastNoteAt = (note: string) =>
    history
      .filter((row) => row.note === note)
      .reduce<number | null>((latest, row) => {
        const at = Date.parse(row.changedAt);
        return latest === null || at > latest ? at : latest;
      }, null);

  const unmatchedAt = lastNoteAt(
    OrderStatusHistoryEntityNote.PROVIDER_REFUND_UNMATCHED,
  );
  const lastPayoutAt = money.entries
    .filter(
      (entry) =>
        entry.direction === MoneyDirection.OUT &&
        entry.reversalOfId === null &&
        entry.voidedAt === null,
    )
    .reduce<number | null>((latest, entry) => {
      const at = Date.parse(entry.createdAt);
      return latest === null || at > latest ? at : latest;
    }, null);
  const unmatched =
    unmatchedAt !== null &&
    (lastPayoutAt === null || lastPayoutAt < unmatchedAt);
  const legacyUnknown =
    lastNoteAt(OrderStatusHistoryEntityNote.LEGACY_MONEY_UNKNOWN) !== null &&
    money.totals.refundedKop === 0;

  if (!unmatched && !legacyUnknown) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {unmatched ? (
        <Badge variant="warning">
          <TriangleAlertIcon aria-hidden="true" />
          {m.unmatchedRefundChip}
        </Badge>
      ) : null}
      {legacyUnknown ? (
        <InfoHint badgeVariant="warning" hint={m.legacyUnknownHint}>
          <TriangleAlertIcon aria-hidden="true" />
          {m.legacyUnknownChip}
        </InfoHint>
      ) : null}
    </div>
  );
}

function entryName(entry: OrderMoneyEntryEntity): string {
  return `${moneyKindLabel(entry.kind)}, ${formatKop(entry.amountKop)}, ${formatDateTime(entry.occurredAt)}`;
}

/**
 * The journal, oldest first as the server sends it. A reversed entry stays —
 * struck through, pointing at its reversal; nothing is ever edited away.
 */
function MoneyJournal({
  money,
  onWritten,
}: {
  money: OrderMoneyEntity;
  onWritten: (fresh: OrderMoneyEntity | null) => void;
}) {
  const headingId = useId();
  const byId = new Map(money.entries.map((entry) => [entry.id, entry]));

  return (
    <div className="flex flex-col gap-2">
      <h4 id={headingId} className="text-sm font-medium text-foreground">
        {m.journalHeading}
      </h4>
      {money.entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{m.journalEmpty}</p>
      ) : (
        <ol aria-labelledby={headingId} className="flex flex-col gap-2">
          {money.entries.map((entry) => (
            <JournalRow
              key={entry.id}
              entry={entry}
              original={
                entry.reversalOfId ? byId.get(entry.reversalOfId) : undefined
              }
              money={money}
              onWritten={onWritten}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function JournalRow({
  entry,
  original,
  money,
  onWritten,
}: {
  entry: OrderMoneyEntryEntity;
  original: OrderMoneyEntryEntity | undefined;
  money: OrderMoneyEntity;
  onWritten: (fresh: OrderMoneyEntity | null) => void;
}) {
  const isIn = entry.direction === MoneyDirection.IN;
  const isReversal = entry.reversalOfId !== null;
  // What the row does to the shop's money: a receipt adds, a payout takes,
  // a reversal undoes its original. A sign for the eye, not arithmetic.
  const adds = isIn !== isReversal;
  const reversed = entry.reversedById !== null;
  const voided = entry.voidedAt !== null;
  const Icon = isReversal
    ? RotateCcwIcon
    : isIn
      ? ArrowDownLeftIcon
      : ArrowUpRightIcon;
  const who =
    entry.actorName ??
    (LIQPAY_KINDS.includes(entry.kind) ? m.actorLiqPay : m.actorSystem);
  const name = entryName(entry);

  return (
    <li
      id={`money-entry-${entry.id}`}
      data-testid="money-entry"
      className="flex scroll-mt-20 flex-col gap-1.5 rounded-md border border-border p-3 text-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
        <span className="font-medium text-foreground">
          {isReversal ? m.reversalLabel : isIn ? m.directionIn : m.directionOut}
        </span>
        <span
          className={cn(
            "text-foreground",
            (reversed || voided) && "line-through",
          )}
        >
          {moneyKindLabel(entry.kind)}
        </span>
        <span
          className={cn(
            "ml-auto text-sm font-semibold tabular-nums",
            adds ? "text-success" : "text-foreground",
            (reversed || voided) && "text-muted-foreground line-through",
          )}
        >
          {adds ? "+" : "−"}
          {formatKop(entry.amountKop)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
        <span>{who}</span>
        <time dateTime={entry.occurredAt}>
          {formatDateTime(entry.occurredAt)}
        </time>
        {entry.returnId ? (
          <Link
            href={`/returns/${entry.returnId}`}
            className="text-primary hover:underline"
          >
            {m.forReturn}
          </Link>
        ) : null}
      </div>

      {entry.reason ? (
        <p className="whitespace-pre-wrap text-foreground">{entry.reason}</p>
      ) : null}

      {isReversal && original ? (
        <a
          href={`#money-entry-${original.id}`}
          className="self-start text-primary hover:underline"
        >
          {m.reversalOf(formatDateTime(original.occurredAt))}
        </a>
      ) : null}
      {reversed ? (
        <p>
          {m.reversedBy}{" "}
          <a
            href={`#money-entry-${entry.reversedById}`}
            className="text-primary hover:underline"
          >
            {m.reversedByLink}
          </a>
        </p>
      ) : null}

      {entry.legacy ||
      voided ||
      (entry.providerState === MoneyProviderState.REQUESTED && !voided) ? (
        <div className="flex flex-wrap gap-1.5">
          {entry.providerState === MoneyProviderState.REQUESTED && !voided ? (
            <Badge variant="warning">{m.requestedChip}</Badge>
          ) : null}
          {voided ? <Badge variant="secondary">{m.voidedChip}</Badge> : null}
          {entry.legacy ? (
            <Badge variant="outline">{m.legacyChip}</Badge>
          ) : null}
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
