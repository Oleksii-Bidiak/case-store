import { Injectable } from '@nestjs/common';
import { Prisma, ReturnDecision, ReturnStatus } from '@prisma/client';
import { PrismaService } from '../../prisma';
import {
  creditNotRefundError,
  invalidReturnTransitionError,
  refundRecordedError,
  repairNotInProgressError,
  repairStepAlreadyRecordedError,
  returnAlreadyRestockedError,
} from './return.errors';
import { toCents } from '../../addon-service';
import { returnCreditFor } from '../order-money';
import { OrderMoneyRepository } from '../order-money.repository';
import {
  CacheService,
  productDetailIdKey,
  productDetailSlugKey,
  PRODUCT_LIST_PREFIX,
} from '../../cache';
import { normalizeUaPhone, phoneDigits } from '../../common/validators';
import { ProductIndexer } from '../../search';
import { RETURN_SORT_FIELDS } from './dto';
import type { ReturnSortField } from './dto';
import type {
  AssertReturnClaimable,
  AssertReturnCredit,
  CreateReturnParams,
  ReturnDecideOptions,
  ReturnTransitionBasis,
  ReturnDecisionChange,
  ReturnRepairStepRecord,
  ReturnWithItems,
} from './return.types';

/**
 * The lines, each with the order line it points at (product name + unit price),
 * so a card can be rendered from one query. The base of every read.
 */
const RETURN_LINES_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      orderItem: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          price: true,
          product: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  },
} satisfies Prisma.ReturnInclude;

/** History rows oldest first; `id` breaks ties between rows of one instant. */
const HISTORY_ORDER = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

/**
 * An account as a return names it (TASK-1963): what a display name is built
 * from, and nothing else of the user row.
 */
const ACTOR_SELECT = {
  id: true,
  email: true,
  // A soft-deleted account's `email` is mangled; this is the readable one (TASK-104).
  originalEmail: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

/**
 * The CUSTOMER read (TASK-1963, TASK-2045): the lines and the repair progress.
 * The repair step's `note` and `actorId` are not even selected, and no staff
 * account is joined — `ReturnEntity` strips them too, but what was never read
 * cannot leak.
 */
const RETURNS_INCLUDE = {
  ...RETURN_LINES_INCLUDE,
  repairEvents: {
    orderBy: HISTORY_ORDER,
    select: { id: true, step: true, result: true, destination: true, ttn: true, createdAt: true },
  },
} satisfies Prisma.ReturnInclude;

/**
 * The admin LIST read — the queue and the per-order list (TASK-1963): the
 * owning order with its purchase date, and both authors. Each is a to-one join,
 * which Prisma batches into one query per relation for the whole page, so a page
 * costs a fixed number of queries. The history arrays are left to the card.
 */
const ADMIN_RETURNS_INCLUDE = {
  ...RETURN_LINES_INCLUDE,
  order: { select: { id: true, userId: true, guestEmail: true, status: true, createdAt: true } },
  createdBy: { select: ACTOR_SELECT },
  decidedBy: { select: ACTOR_SELECT },
} satisfies Prisma.ReturnInclude;

/**
 * The admin CARD read — one return in full (TASK-1963, TASK-2044, TASK-2045):
 * the list joins plus the decision history and the repair steps, each with its
 * author and, for repairs, the operator's note. Used by `findById` and by every
 * write that answers with the card (create, resolve, decide).
 */
const ADMIN_RETURN_DETAIL_INCLUDE = {
  ...ADMIN_RETURNS_INCLUDE,
  decisionEvents: { orderBy: HISTORY_ORDER, include: { actor: { select: ACTOR_SELECT } } },
  repairEvents: { orderBy: HISTORY_ORDER, include: { actor: { select: ACTOR_SELECT } } },
} satisfies Prisma.ReturnInclude;

const DEFAULT_PAGE = 1;
/** Kept in step with `ReturnService`'s default — the one admin page size (TASK-423). */
const DEFAULT_LIMIT = 20;
const DEFAULT_SORT_BY: ReturnSortField = 'requestedAt';

/**
 * How many digits a search term must carry before the returns queue treats it as
 * a phone number (TASK-423).
 *
 * Same guard, same number and the same reason as
 * `OrderRepository.SEARCH_PHONE_MIN_DIGITS`: `normalizeUaPhone('ivan')` is `''`
 * and `{ contains: '' }` matches every row, so normalising unconditionally would
 * turn a name search into "show me the whole queue".
 */
const SEARCH_PHONE_MIN_DIGITS = 3;

/**
 * Translate the DTO's sort choice into a Prisma `orderBy` (TASK-354).
 *
 * Two things it does that a one-liner would not:
 *
 * 1. **`id` is always the last tiebreaker.** `status` and `refundedAmount` are
 *    massively non-unique, and Postgres is free to return tied rows in a
 *    different order on every query. Paginating over an unstable ordering makes
 *    rows appear on two pages and others on none — an operator working a queue
 *    would see a return vanish without anyone having touched it.
 * 2. **NULL refunds sort last in both directions.** Postgres puts NULLs first on
 *    DESC, so "sort by refunded, biggest first" would otherwise open with a wall
 *    of unresolved returns that have no amount at all — the opposite of what the
 *    click asked for.
 *
 * The `sortBy` value is already allow-listed by `@IsIn` at the boundary; the
 * fallback here is the defensive default for internal callers.
 */
function buildReturnOrderBy(
  sortBy: ReturnSortField | undefined,
  sortOrder: 'asc' | 'desc' | undefined,
): Prisma.ReturnOrderByWithRelationInput[] {
  const order = sortOrder ?? 'desc';
  const field = sortBy && RETURN_SORT_FIELDS.includes(sortBy) ? sortBy : DEFAULT_SORT_BY;

  const primary: Prisma.ReturnOrderByWithRelationInput =
    field === 'refundedAmount'
      ? { refundedAmount: { sort: order, nulls: 'last' } }
      : { [field]: order };

  return [primary, { id: 'asc' }];
}

@Injectable()
export class ReturnRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly productIndexer: ProductIndexer,
    // R2 A3 (TASK-2046): a decision or a credit change moves the order's money
    // totals (`returnCreditKop`, balance) in the same locked transaction.
    private readonly money: OrderMoneyRepository,
  ) {}

  /**
   * Open a return request with its lines, checking the "no more than was bought"
   * cap in the SAME transaction as the insert (TASK-340, TASK-784).
   *
   * ── Why the order row is locked ─────────────────────────────────────────────
   * The cap is a sum over every live return of the order, and a sum cannot be
   * guarded by a unique key or a CHECK. It used to be read before the insert as a
   * separate statement, so two concurrent "Подати заявку" clicks on the last unit
   * both read "0 claimed", both inserted, and resolving each with `restock`
   * credited the shop a unit it never got back.
   *
   * `SELECT … FOR UPDATE` on the order serialises every return opened against
   * it: the second request blocks on the first's row lock and, under READ
   * COMMITTED, its ledger read (a new statement) sees the first's committed
   * return. The check then refuses it. Returns against other orders never wait.
   *
   * @param assertClaimable the service's rule, run against the locked ledger;
   *   throwing rolls the transaction back before anything is written.
   * @param afterCreate optional hook run in the SAME transaction right after the
   *   insert, with the inserted return (TASK-677: the shop's Telegram ping for a
   *   customer's request). Throwing rolls the return back with it.
   */
  async create(
    params: CreateReturnParams,
    assertClaimable: AssertReturnClaimable,
    afterCreate?: (tx: Prisma.TransactionClient, created: ReturnWithItems) => Promise<void>,
  ): Promise<ReturnWithItems> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${params.orderId} FOR UPDATE`;

      const ledger = await tx.return.findMany({
        where: { orderId: params.orderId },
        select: { status: true, items: { select: { orderItemId: true, quantity: true } } },
      });
      assertClaimable(ledger);

      const created = await this.insertReturn(tx, params);
      if (afterCreate) {
        await afterCreate(tx, created);
      }
      return created;
    });
  }

  private insertReturn(
    tx: Prisma.TransactionClient,
    params: CreateReturnParams,
  ): Promise<ReturnWithItems> {
    return tx.return.create({
      data: {
        orderId: params.orderId,
        reason: params.reason ?? null,
        // TASK-469: written on BOTH doors. The customer's door has always known
        // who it was serving and simply threw the fact away; the admin door has
        // no other way to record it, since a guest order carries no user at all.
        createdByUserId: params.createdByUserId ?? null,
        // TASK-2044/1963: what was asked for, and through which door.
        requestedOutcome: params.requestedOutcome ?? null,
        channel: params.channel,
        items: {
          create: params.items.map((item) => ({
            orderItemId: item.orderItemId,
            quantity: item.quantity,
          })),
        },
      },
      // The full card: a fresh return has no decision and no repair yet, so the
      // only account it can name is whoever just opened it — and the customer
      // projection drops even that.
      include: ADMIN_RETURN_DETAIL_INCLUDE,
    }) as Promise<ReturnWithItems>;
  }

  /** One return in full — the admin card (TASK-1963): authors, history, repair notes. */
  findById(returnId: string): Promise<ReturnWithItems | null> {
    return this.prisma.return.findUnique({
      where: { id: returnId },
      include: ADMIN_RETURN_DETAIL_INCLUDE,
    }) as Promise<ReturnWithItems | null>;
  }

  /**
   * Every return opened against one order — the "already returned" ledger.
   *
   * @param options.admin the operator's read (TASK-1963): authors and purchase
   *   date joined. Without it, the customer read: no staff account is loaded.
   */
  findByOrderId(orderId: string, options: { admin?: boolean } = {}): Promise<ReturnWithItems[]> {
    return this.prisma.return.findMany({
      where: { orderId },
      include: options.admin ? ADMIN_RETURNS_INCLUDE : RETURNS_INCLUDE,
      orderBy: { requestedAt: 'desc' },
    }) as Promise<ReturnWithItems[]>;
  }

  /**
   * Every return opened against the customer's own orders, newest request first
   * (TASK-608).
   *
   * Scoped through `order.userId`, not `createdByUserId`: a return the shop filed
   * on the customer's behalf is still THEIR return, while `createdByUserId` names
   * whoever pressed the button. Soft-deleted orders are left out for the same
   * reason `GET /orders` leaves them out — the customer can no longer see the
   * order, so a status line pointing at it would point at nothing.
   *
   * @param limit hard cap; a customer's list is short, and an unbounded read on a
   *   public route is a cost nobody asked for.
   */
  findByUserId(userId: string, limit: number): Promise<ReturnWithItems[]> {
    return this.prisma.return.findMany({
      where: { order: { userId, deletedAt: null } },
      include: RETURNS_INCLUDE,
      orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
      take: limit,
    }) as Promise<ReturnWithItems[]>;
  }

  /**
   * Admin — paginated list, newest request first by default, optionally filtered
   * by status and sorted on one of {@link RETURN_SORT_FIELDS} (TASK-354).
   */
  async findAll(query: {
    status?: ReturnStatus;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: ReturnSortField;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ returns: ReturnWithItems[]; total: number }> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where: Prisma.ReturnWhereInput = { ...(query.status ? { status: query.status } : {}) };

    // TASK-423: the queue had no search at all, so an operator holding a phone
    // call ("я повертаю замовлення ABC12345") could only page through it.
    //
    // The arms mirror `OrderRepository.findAllForAdmin` deliberately — a return is
    // reached THROUGH an order, and the operator has whatever the customer is
    // reading out. Both ids are matched as a lowercased PREFIX because the
    // operator reads back the uppercase short form of a uuid, and the column
    // holds the full lowercase one.
    if (query.search) {
      const term = query.search;
      const or: Prisma.ReturnWhereInput[] = [
        { id: { startsWith: term.toLowerCase() } },
        { order: { id: { startsWith: term.toLowerCase() } } },
        { order: { guestEmail: { contains: term, mode: 'insensitive' } } },
        { order: { user: { email: { contains: term, mode: 'insensitive' } } } },
        // What the customer said, in their words — the one column of a return
        // that is free text and the one an operator searches by topic.
        { reason: { contains: term, mode: 'insensitive' } },
      ];

      if (phoneDigits(term).length >= SEARCH_PHONE_MIN_DIGITS) {
        const phoneTerm = normalizeUaPhone(term);
        or.push({ order: { guestPhone: { contains: phoneTerm } } });
        or.push({ order: { user: { phone: { contains: phoneTerm } } } });
      }

      where.OR = or;
    }

    const [total, returns] = await this.prisma.$transaction([
      this.prisma.return.count({ where }),
      this.prisma.return.findMany({
        where,
        include: ADMIN_RETURNS_INCLUDE,
        orderBy: buildReturnOrderBy(query.sortBy, query.sortOrder),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { returns: returns as ReturnWithItems[], total };
  }

  /**
   * Apply an operator's decision, optionally crediting the returned goods back to
   * sellable stock, in ONE transaction (TASK-340).
   *
   * ── The double-restock guard ────────────────────────────────────────────────
   * `restockedAt IS NULL` is the arbiter, exactly as it is on `Order.restockedAt`
   * (TASK-315), and for exactly the same reason: the caller's earlier status read
   * happened OUTSIDE this transaction, so two concurrent "mark received" clicks —
   * a double click, a retry on a flaky connection, two operators on one queue —
   * would both pass it and both credit the stock. One box back, two increments:
   * phantom inventory that is then sold to someone who will never receive it.
   *
   * Making the stamp itself the WHERE means the loser blocks on the winner's row
   * lock, re-evaluates after it commits, matches zero rows, and aborts before
   * touching a single product.
   *
   * Money is not written here since R2 A3 (TASK-2046): payouts are ledger
   * entries (`OrderMoneyService.recordPayout`) and REFUNDED follows from them.
   *
   * ── The state guard (TASK-1961, TASK-2044) ─────────────────────────────────
   * The service validated the move against `current`, read outside this
   * transaction. Both branches write conditionally on the row still holding
   * that status and decision — the same guard `decide` uses — so a decision or
   * another PATCH committed in between is refused with 409 rather than silently
   * overwritten (a refusal turned into RECEIVED, money recorded on what had
   * just become a replacement). The conditional write also row-locks the
   * return, so transitions on one return serialise.
   *
   * @throws ConflictException RETURN_ALREADY_RESTOCKED when the stock was
   *   already credited back; RETURN_TRANSITION_INVALID when the return moved
   *   since the service read it.
   */
  async resolve(
    current: ReturnTransitionBasis,
    fields: {
      status: ReturnStatus;
      operatorNotes?: string | null;
      resolvedAt?: Date | null;
    },
    options: { restock?: boolean } = {},
  ): Promise<ReturnWithItems> {
    const returnId = current.id;
    const unchanged = { id: returnId, status: current.status, decision: current.decision };
    const updated = (await this.prisma.$transaction(async (tx) => {
      const existing = await tx.return.findUniqueOrThrow({
        where: { id: returnId },
        include: RETURN_LINES_INCLUDE,
      });

      const data: Prisma.ReturnUpdateManyMutationInput = { status: fields.status };
      if (fields.operatorNotes !== undefined) data.operatorNotes = fields.operatorNotes;
      if (fields.resolvedAt !== undefined) data.resolvedAt = fields.resolvedAt;

      if (!options.restock) {
        const { count } = await tx.return.updateMany({ where: unchanged, data });
        if (count === 0) {
          throw invalidReturnTransitionError(current.status, fields.status);
        }
        return tx.return.findUniqueOrThrow({
          where: { id: returnId },
          include: ADMIN_RETURN_DETAIL_INCLUDE,
        });
      }

      // The arbiter. Runs BEFORE any stock write.
      const { count } = await tx.return.updateMany({
        where: { ...unchanged, restockedAt: null },
        data: { ...data, restockedAt: new Date() },
      });

      if (count === 0) {
        // Two reasons a guarded write matches nothing; the operator is told which.
        const now = await tx.return.findUnique({
          where: { id: returnId },
          select: { restockedAt: true },
        });
        throw now?.restockedAt
          ? returnAlreadyRestockedError()
          : invalidReturnTransitionError(current.status, fields.status);
      }

      // The product is reached through the order line rather than stored on the
      // return: the order line is the financial record of what was actually
      // bought, and duplicating the product id onto the return would create a
      // second version of that fact, free to drift.
      for (const item of existing.items) {
        const productId = item.orderItem.productId;
        await tx.product.update({
          where: { id: productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      return tx.return.findUniqueOrThrow({
        where: { id: returnId },
        include: ADMIN_RETURN_DETAIL_INCLUDE,
      });
    })) as ReturnWithItems;

    if (options.restock) {
      await this.evictProductCaches(updated);
    }

    return updated;
  }

  /**
   * The operator's notes alone, on a return of any status — no transition, so
   * no state guard: the notes do not depend on the status or the decision, and
   * `resolvedAt` ("the last step") is left alone. Answers with the admin card.
   */
  updateNotes(returnId: string, operatorNotes: string | null): Promise<ReturnWithItems> {
    return this.prisma.return.update({
      where: { id: returnId },
      data: { operatorNotes },
      include: ADMIN_RETURN_DETAIL_INCLUDE,
    }) as Promise<ReturnWithItems>;
  }

  /**
   * Record an operator's decision (TASK-1961, TASK-2044): the denormalised
   * current decision on the return AND its history row, in ONE transaction.
   *
   * ── The order lock ──────────────────────────────────────────────────────────
   * The same `SELECT … FOR UPDATE` on the order row that `create` takes, so a
   * decision and a new request on the same order serialise. It matters for one
   * case: re-opening a REJECTED return claims its units back, and a customer may
   * have filed a new request for those units since the refusal released them.
   * When the service passes `assertClaimable`, the OTHER returns of the order
   * are read under the lock and checked before anything is written.
   *
   * ── The state guard ─────────────────────────────────────────────────────────
   * The service decided against a read taken outside this transaction. The
   * write is conditional on the row still holding that status and decision; a
   * return another operator moved meanwhile (say, to RECEIVED, with its goods
   * restocked) is refused with 409 rather than silently overwritten.
   *
   * @throws ConflictException (RETURN_TRANSITION_INVALID) when the return changed
   *   since the service read it; whatever `assertClaimable` throws.
   */
  async decide(
    current: ReturnTransitionBasis,
    change: ReturnDecisionChange,
    options: ReturnDecideOptions = {},
  ): Promise<ReturnWithItems> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${current.orderId} FOR UPDATE`;

      if (options.assertClaimable) {
        const ledger = await tx.return.findMany({
          where: { orderId: current.orderId, id: { not: current.id } },
          select: { status: true, items: { select: { orderItemId: true, quantity: true } } },
        });
        options.assertClaimable(ledger);
      }

      // R2 A3 (TASK-2046): "money already went out" is the ledger's answer,
      // read under the same lock every payout takes.
      if (options.refuseIfPaidOut && (await this.money.returnPaidOutKop(tx, current.id)) > 0) {
        throw refundRecordedError(change.decision);
      }

      const credit: Prisma.ReturnUpdateManyMutationInput =
        options.credit === 'compute'
          ? {
              creditKop: await this.computeCredit(tx, current.orderId, current.id),
              creditReason: null,
            }
          : options.credit === 'clear'
            ? { creditKop: null, creditReason: null }
            : {};

      const { count } = await tx.return.updateMany({
        where: { id: current.id, status: current.status, decision: current.decision },
        data: {
          status: change.status,
          decision: change.decision,
          decisionReason: change.decisionReason,
          decidedAt: change.decidedAt,
          decidedById: change.decidedById,
          // A decision a person took is no longer the R1 backfill's inference.
          decisionLegacy: false,
          // `resolvedAt` stays "the last change" (plan 2026-10, Модель даних).
          resolvedAt: change.decidedAt,
          ...credit,
        },
      });
      if (count === 0) {
        throw invalidReturnTransitionError(current.status, change.status);
      }

      await tx.returnDecisionEvent.create({
        data: {
          returnId: current.id,
          decision: change.decision,
          reason: change.decisionReason,
          actorId: change.decidedById,
          createdAt: change.decidedAt,
        },
      });

      // The credit is part of the order's balance — recompute it in this tx.
      if (options.credit) {
        await this.money.recompute(tx, current.orderId, options.actorId ?? null);
      }

      return tx.return.findUniqueOrThrow({
        where: { id: current.id },
        include: ADMIN_RETURN_DETAIL_INCLUDE,
      });
    }) as Promise<ReturnWithItems>;
  }

  /**
   * Lower a refund return's credit («до повернення», R2 A3, TASK-2046), in ONE
   * transaction under the order-row lock — the lock every payout takes:
   *
   * 1. the ceilings are read fresh — the credit as computed now, and the
   *    payouts already made on the return — and handed to the service's rule;
   * 2. the write is conditional on the return still being a REFUND with a
   *    credit (a decision changed meanwhile → 409 RETURN_CREDIT_NOT_REFUND);
   * 3. the order's totals are recomputed and the return's status re-derived (a
   *    credit lowered to what was paid out makes it REFUNDED).
   */
  async setCredit(
    current: ReturnTransitionBasis,
    change: { creditKop: number; creditReason: string },
    options: { assertCredit: AssertReturnCredit; actorId: string },
  ): Promise<ReturnWithItems> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${current.orderId} FOR UPDATE`;

      options.assertCredit({
        computedKop: await this.computeCredit(tx, current.orderId, current.id),
        paidOutKop: await this.money.returnPaidOutKop(tx, current.id),
      });

      const { count } = await tx.return.updateMany({
        where: { id: current.id, decision: ReturnDecision.REFUND, creditKop: { not: null } },
        data: { creditKop: change.creditKop, creditReason: change.creditReason },
      });
      if (count === 0) {
        throw creditNotRefundError();
      }

      await this.money.recompute(tx, current.orderId, options.actorId);
      await this.money.syncReturnStatus(tx, current.id);

      return tx.return.findUniqueOrThrow({
        where: { id: current.id },
        include: ADMIN_RETURN_DETAIL_INCLUDE,
      });
    }) as Promise<ReturnWithItems>;
  }

  /**
   * The credit this return would carry now (TASK-2046): its lines' value less
   * their share of the order's promo discount, telescoped over the units the
   * order's OTHER refund returns already credited (`returnCreditFor`). Integer
   * kopecks; lines in `(createdAt, id)` order, as the R2 backfill reads them.
   */
  private async computeCredit(
    tx: Prisma.TransactionClient,
    orderId: string,
    returnId: string,
  ): Promise<number> {
    // Sequential: one transaction is one connection — no parallel queries on it.
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        discount: true,
        items: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, quantity: true, price: true },
        },
      },
    });
    const returns = await tx.return.findMany({
      where: { orderId },
      select: {
        id: true,
        creditKop: true,
        items: { select: { orderItemId: true, quantity: true } },
      },
    });

    const creditedBefore = new Map<string, number>();
    for (const other of returns) {
      if (other.id === returnId || other.creditKop === null) continue;
      for (const item of other.items) {
        creditedBefore.set(
          item.orderItemId,
          (creditedBefore.get(item.orderItemId) ?? 0) + item.quantity,
        );
      }
    }

    return returnCreditFor({
      lines: order.items.map((line) => ({
        id: line.id,
        quantity: line.quantity,
        grossKop: toCents(line.price) * line.quantity,
      })),
      discountKop: toCents(order.discount),
      items: returns.find((ret) => ret.id === returnId)?.items ?? [],
      creditedBefore,
    });
  }

  /**
   * Record one repair step (TASK-2045): stamp the return and write the step row
   * in ONE transaction, then answer with the admin card.
   *
   * ── The two guards ──────────────────────────────────────────────────────────
   * The service checked the decision and the order of steps against a read
   * taken outside this transaction.
   * - The stamp is conditional on the return still being an open REPAIR, so a
   *   step never lands after another operator changed the decision (an
   *   UNREPAIRABLE item moved to a refund). It also row-locks the return, so
   *   steps on one return serialise.
   * - Two clicks on the same step both pass the service's check. The unique
   *   index on (return_id, step) fails the second insert; it is answered as a
   *   409 rather than a 500.
   *
   * @throws ConflictException (RETURN_REPAIR_STEP_INVALID) on either guard.
   */
  async addRepairStep(returnId: string, event: ReturnRepairStepRecord): Promise<ReturnWithItems> {
    try {
      return (await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.return.updateMany({
          where: {
            id: returnId,
            decision: ReturnDecision.REPAIR,
            status: { notIn: [ReturnStatus.REJECTED, ReturnStatus.REFUNDED] },
          },
          // `resolvedAt` stays "the last change" (plan 2026-10, Модель даних).
          data: { resolvedAt: event.createdAt },
        });
        if (count === 0) {
          throw repairNotInProgressError();
        }

        await tx.returnRepairEvent.create({ data: { returnId, ...event } });

        return tx.return.findUniqueOrThrow({
          where: { id: returnId },
          include: ADMIN_RETURN_DETAIL_INCLUDE,
        });
      })) as ReturnWithItems;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw repairStepAlreadyRecordedError(event.step);
      }
      throw error;
    }
  }

  /**
   * Evict the product caches touched by a restock — every list page plus each
   * affected product's detail entries. Mirrors `OrderRepository.evictProductCaches`;
   * eviction errors are swallowed inside CacheService, so they never affect the
   * return.
   *
   * Like its twin, this does NOT purge the storefront's ISR cache — see the
   * reasoning on `OrderRepository.evictProductCaches` (TASK-384). A restock only
   * ever makes MORE stock available, so the stale copy understates availability:
   * the safe direction to be wrong in.
   */
  private async evictProductCaches(returned: ReturnWithItems): Promise<void> {
    await this.cache.delByPrefix(PRODUCT_LIST_PREFIX);
    const seen = new Set<string>();
    for (const item of returned.items) {
      const product = item.orderItem?.product;
      if (!product || seen.has(product.id)) continue;
      seen.add(product.id);
      await this.cache.del(productDetailSlugKey(product.slug));
      await this.cache.del(productDetailIdKey(product.id));
    }

    // Third derived read model, added in TASK-417: the search index carries an
    // `inStock` facet. A restock that skips it leaves the product missing from
    // «В наявності» on `/search` until an admin happens to edit the card — the
    // mirror of the sale case handled by the twin in `OrderRepository`. Fired,
    // never awaited: a search engine must not be able to delay a refund.
    for (const productId of seen) {
      void this.productIndexer.index(productId).catch(() => {
        // ProductIndexer logs its own failures; a rejection before it gets that
        // far is still never allowed to touch the return.
      });
    }
  }
}
