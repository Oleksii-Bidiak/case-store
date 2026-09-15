import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, ReturnStatus } from '@prisma/client';
import { PrismaService } from '../../prisma';
import {
  CacheService,
  productDetailIdKey,
  productDetailSlugKey,
  PRODUCT_LIST_PREFIX,
} from '../../cache';
import { normalizeUaPhone, phoneDigits } from '../../common/validators';
import { ProductIndexer } from '../../search/product-indexer';
import { RETURN_SORT_FIELDS } from './dto';
import type { ReturnSortField } from './dto';
import type { CreateReturnParams, ReturnWithItems } from './return.types';

/**
 * Shared include for return reads: the lines, each with the order line it points
 * at (product name + unit price), so an admin card can be rendered from one query.
 */
const RETURNS_INCLUDE = {
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

const ADMIN_RETURNS_INCLUDE = {
  ...RETURNS_INCLUDE,
  order: { select: { id: true, userId: true, guestEmail: true, status: true } },
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
  ) {}

  /** Open a return request with its lines in one write (TASK-340). */
  async create(params: CreateReturnParams): Promise<ReturnWithItems> {
    return this.prisma.return.create({
      data: {
        orderId: params.orderId,
        reason: params.reason ?? null,
        // TASK-469: written on BOTH doors. The customer's door has always known
        // who it was serving and simply threw the fact away; the admin door has
        // no other way to record it, since a guest order carries no user at all.
        createdByUserId: params.createdByUserId ?? null,
        items: {
          create: params.items.map((item) => ({
            orderItemId: item.orderItemId,
            quantity: item.quantity,
          })),
        },
      },
      include: RETURNS_INCLUDE,
    }) as Promise<ReturnWithItems>;
  }

  findById(returnId: string): Promise<ReturnWithItems | null> {
    return this.prisma.return.findUnique({
      where: { id: returnId },
      include: ADMIN_RETURNS_INCLUDE,
    }) as Promise<ReturnWithItems | null>;
  }

  /** Every return opened against one order — the "already returned" ledger. */
  findByOrderId(orderId: string): Promise<ReturnWithItems[]> {
    return this.prisma.return.findMany({
      where: { orderId },
      include: RETURNS_INCLUDE,
      orderBy: { requestedAt: 'desc' },
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
   * @throws ConflictException when the stock was already credited back.
   */
  async resolve(
    returnId: string,
    fields: {
      status: ReturnStatus;
      operatorNotes?: string | null;
      refundedAmount?: string | null;
      resolvedAt?: Date | null;
    },
    options: { restock?: boolean } = {},
  ): Promise<ReturnWithItems> {
    const updated = (await this.prisma.$transaction(async (tx) => {
      const existing = await tx.return.findUniqueOrThrow({
        where: { id: returnId },
        include: RETURNS_INCLUDE,
      });

      const data: Prisma.ReturnUpdateInput = { status: fields.status };
      if (fields.operatorNotes !== undefined) data.operatorNotes = fields.operatorNotes;
      if (fields.refundedAmount !== undefined) {
        data.refundedAmount =
          fields.refundedAmount === null ? null : new Prisma.Decimal(fields.refundedAmount);
      }
      if (fields.resolvedAt !== undefined) data.resolvedAt = fields.resolvedAt;

      if (!options.restock) {
        await tx.return.update({ where: { id: returnId }, data });
        return tx.return.findUniqueOrThrow({
          where: { id: returnId },
          include: ADMIN_RETURNS_INCLUDE,
        });
      }

      // The arbiter. Runs BEFORE any stock write.
      const { count } = await tx.return.updateMany({
        where: { id: returnId, restockedAt: null },
        data: { ...data, restockedAt: new Date() },
      });

      if (count === 0) {
        throw new ConflictException(
          'These returned goods have already been credited back to inventory',
        );
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
        include: ADMIN_RETURNS_INCLUDE,
      });
    })) as ReturnWithItems;

    if (options.restock) {
      await this.evictProductCaches(updated);
    }

    return updated;
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
