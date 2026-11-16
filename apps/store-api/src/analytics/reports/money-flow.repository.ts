import { Injectable } from '@nestjs/common';
import { MoneyDirection, MoneyEntryKind, MoneyProviderState, Prisma } from '@prisma/client';
import { orderNumber } from '../../mail';
// eslint-disable-next-line local/no-deep-module-import -- cycle: order barrel > order.module > order.repository > dashboard barrel > dashboard.module > reports.module > this file
import { actorDisplayName } from '../../order/order-money.repository';
import { PrismaService } from '../../prisma';
import { ReportRange } from './report-period';

/** One ledger kind's money in a range, in integer kopecks. */
export interface MoneyFlowKindTotals {
  kind: MoneyEntryKind;
  direction: MoneyDirection;
  /** Σ of the ordinary (non-reversal) entries dated in the range. */
  grossKop: number;
  /** Σ of the reversals (сторно) dated in the range, as a positive number. */
  reversedKop: number;
  /** grossKop − reversedKop: what the kind actually moved in the range; may be negative. */
  netKop: number;
  /** Entries dated in the range, reversals included. */
  count: number;
  /** Part of `grossKop` that LiqPay has not confirmed yet (`provider_state = REQUESTED`). */
  requestedKop: number;
}

/** Orders and money of one balance side. */
export interface MoneyBalance {
  orders: number;
  /** Always ≥ 0 — the side says who owes whom. */
  kop: number;
}

/** Who owes whom right now, independent of any period. */
export interface MoneyBalances {
  /** «Борг»: DELIVERED with `balance_kop > 0` — exactly the order list's `hasDebt`. */
  debt: MoneyBalance;
  /** The shop owes the customer: `balance_kop < 0`, any status — the list's `owedToCustomer`. */
  owedToCustomer: MoneyBalance;
}

/** One line of the register. */
export interface MoneyFlowEntryRow {
  id: string;
  occurredAt: Date;
  createdAt: Date;
  orderId: string;
  /** The short number the admin prints as `#XXXXXXXX` (first 8 id chars, uppercased). */
  orderNumber: string;
  direction: MoneyDirection;
  kind: MoneyEntryKind;
  /** As stored: integer kopecks, always > 0. */
  amountKop: number;
  /**
   * `amountKop` with the REVERSAL sign only: negative for a сторно, positive
   * otherwise. The direction is NOT folded in — an OUT payout stays positive,
   * because the register shows IN and OUT in their own columns and a refund is
   * not a "negative receipt". Σ signedKop over one direction is that
   * direction's net, which is what the breakdown reports.
   */
  signedKop: number;
  isReversal: boolean;
  reversalOfId: string | null;
  providerState: MoneyProviderState | null;
  legacy: boolean;
  /** The operator who wrote it; null for LiqPay/system rows. */
  actorName: string | null;
  reason: string | null;
}

export interface MoneyFlowEntriesFilter {
  kind?: MoneyEntryKind;
  page: number;
  limit: number;
}

interface KindSumsRow {
  kind: MoneyEntryKind;
  direction: MoneyDirection;
  gross_kop: bigint | number;
  reversed_kop: bigint | number;
  count: bigint | number;
  requested_kop: bigint | number;
}

interface BalancesRow {
  debt_orders: bigint | number;
  debt_kop: bigint | number;
  owed_orders: bigint | number;
  owed_kop: bigint | number;
}

/**
 * «Рух коштів» — the order money ledger read across every order (TASK-2395).
 *
 * ── The rules (owner decisions, TASK-2395) ──────────────────────────────────
 * - An entry belongs to the Kyiv day of its `occurred_at` — when the money
 *   moved, not when it was written down. A reversal (сторно) has its original's
 *   direction and kind and is SUBTRACTED on its OWN day, so a closed month never
 *   changes when a mistake is corrected later.
 * - A voided row (a LiqPay refund the provider refused) never moved money: it is
 *   in no sum and not in the register.
 * - A LiqPay refund still `REQUESTED` IS counted, as in the sales report's
 *   refunds and in the order balance; its amount is also reported apart.
 * - Legacy (R2 backfill) rows are ordinary rows here: counted once, flagged.
 *
 * The range predicate is the sales report's (`sales.repository.ts`): the UTC
 * wall-clock column compared with the range's UTC instants, no `::timestamptz`
 * — so the OUT total here and the refunds there are the same rows to the kopeck.
 *
 * Sums are integer kopecks, `bigint` in SQL; they come back as `bigint` and
 * pass through {@link toKop}, which refuses anything a JS number cannot hold
 * exactly instead of rounding it.
 */
@Injectable()
export class MoneyFlowRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Per-kind money of `range`; kinds with no entry in it are absent (the caller fills zeros). */
  async getByKind(range: ReportRange): Promise<MoneyFlowKindTotals[]> {
    const rows = await this.prisma.$queryRaw<KindSumsRow[]>`
      SELECT m.kind::text AS kind,
             m.direction::text AS direction,
             COALESCE(SUM(m.amount_kop) FILTER (WHERE m.reversal_of_id IS NULL), 0)::bigint
               AS gross_kop,
             COALESCE(SUM(m.amount_kop) FILTER (WHERE m.reversal_of_id IS NOT NULL), 0)::bigint
               AS reversed_kop,
             COUNT(*)::bigint AS count,
             -- Part of gross_kop, so reversals stay out: a LIQPAY_REFUND is never reversed
             -- (canReverse refuses provider kinds; a refused request is voided instead).
             COALESCE(SUM(m.amount_kop) FILTER (
               WHERE m.reversal_of_id IS NULL AND m.provider_state = 'REQUESTED'
             ), 0)::bigint AS requested_kop
      FROM order_money_entries m
      WHERE ${liveInRange(range)}
      GROUP BY m.kind, m.direction
    `;
    return rows.map((row) => {
      const grossKop = toKop(row.gross_kop);
      const reversedKop = toKop(row.reversed_kop);
      return {
        kind: row.kind,
        direction: row.direction,
        grossKop,
        reversedKop,
        netKop: grossKop - reversedKop,
        count: toKop(row.count),
        requestedKop: toKop(row.requested_kop),
      };
    });
  }

  /**
   * Debts and overpayments AS OF NOW — read from `orders.balance_kop`, the
   * ledger's same-transaction cache, under exactly the order list's filters
   * (`hasDebt`, `owedToCustomer`, both on live orders only), so the number on
   * the report and the rows behind its link are the same set.
   */
  async getBalances(): Promise<MoneyBalances> {
    const rows = await this.prisma.$queryRaw<BalancesRow[]>`
      SELECT COUNT(*) FILTER (WHERE o.status = 'DELIVERED'
                                AND o.balance_kop > 0)::bigint AS debt_orders,
             COALESCE(SUM(o.balance_kop) FILTER (
               WHERE o.status = 'DELIVERED' AND o.balance_kop > 0
             ), 0)::bigint AS debt_kop,
             COUNT(*) FILTER (WHERE o.balance_kop < 0)::bigint AS owed_orders,
             COALESCE(-SUM(o.balance_kop) FILTER (WHERE o.balance_kop < 0), 0)::bigint
               AS owed_kop
      FROM orders o
      WHERE o.deleted_at IS NULL
        AND o.balance_kop <> 0
    `;
    const row = rows[0];
    return {
      debt: { orders: toKop(row.debt_orders), kop: toKop(row.debt_kop) },
      owedToCustomer: { orders: toKop(row.owed_orders), kop: toKop(row.owed_kop) },
    };
  }

  /** The register: live entries of `range`, oldest first (`occurred_at`, then `id`). */
  async findEntries(
    range: ReportRange,
    filter: MoneyFlowEntriesFilter,
  ): Promise<{ rows: MoneyFlowEntryRow[]; total: number }> {
    const where: Prisma.OrderMoneyEntryWhereInput = {
      voidedAt: null,
      occurredAt: { gte: range.start, lt: range.end },
      ...(filter.kind ? { kind: filter.kind } : {}),
    };
    const [entries, total] = await Promise.all([
      this.prisma.orderMoneyEntry.findMany({
        where,
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        include: {
          actor: {
            select: { email: true, originalEmail: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.orderMoneyEntry.count({ where }),
    ]);
    return {
      total,
      rows: entries.map((entry) => {
        const isReversal = entry.reversalOfId !== null;
        return {
          id: entry.id,
          occurredAt: entry.occurredAt,
          createdAt: entry.createdAt,
          orderId: entry.orderId,
          orderNumber: orderNumber(entry.orderId),
          direction: entry.direction,
          kind: entry.kind,
          amountKop: entry.amountKop,
          signedKop: isReversal ? -entry.amountKop : entry.amountKop,
          isReversal,
          reversalOfId: entry.reversalOfId,
          providerState: entry.providerState,
          legacy: entry.legacy,
          actorName: entry.actor ? actorDisplayName(entry.actor) : null,
          reason: entry.reason,
        };
      }),
    };
  }
}

/** Live (never voided) entries whose `occurred_at` is in `[start, end)` — see the class doc. */
function liveInRange(range: ReportRange): Prisma.Sql {
  return Prisma.sql`m.voided_at IS NULL
    AND m.occurred_at >= ${range.start}
    AND m.occurred_at < ${range.end}`;
}

/** A SQL `bigint` (or a small int some drivers hand back as number) as an exact JS number. */
function toKop(value: bigint | number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`Kopeck sum ${String(value)} is outside the exact integer range`);
  }
  return result;
}
