import { Injectable } from '@nestjs/common';
import { FaqItem, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { ReorderTx, acquireAdvisoryLocks, lockKey, reorderBucket } from '../common/reorder';

/** Page size used when the admin asks for a page but names no `limit` (TASK-357). */
const DEFAULT_ADMIN_PAGE_SIZE = 20;

/**
 * Advisory-lock namespace for FAQ items (TASK-428). MANDATORY prefix: advisory locks are
 * DATABASE-GLOBAL, so without it the FAQ list would serialise against an unrelated
 * resource's bucket of the same name.
 */
const LOCK_RESOURCE = 'faq';

/** FAQ items are ONE global list — a single bucket, hence the `null` bucket key. */
const FAQ_LOCK_KEY = lockKey(LOCK_RESOURCE, null);

/** Any client the reads accept: the injected singleton or an interactive-transaction client. */
type FaqDbClient = PrismaService | ReorderTx;

/**
 * Filter params for the admin FAQ list. `page` / `limit` are OPTIONAL and
 * jointly opt-in: with both absent the read returns the complete list, exactly
 * as it did before TASK-357.
 */
export interface FindAllAdminParams {
  page?: number;
  limit?: number;
  search?: string;
}

/**
 * Result of an admin FAQ query. `total` counts the rows matching the FILTERS,
 * not the rows returned, so the caller can build honest pagination metadata.
 */
export interface PaginatedFaqItemsResult {
  items: FaqItem[];
  total: number;
}

/**
 * Allowed fields for creating a FAQ item. `sortOrder`/`isActive` fall back to
 * their column defaults when omitted.
 */
export interface CreateFaqItemInput {
  question: string;
  answer: string;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * Allowed fields for updating a FAQ item. Only provided fields are written.
 */
export interface UpdateFaqItemInput {
  question?: string;
  answer?: string;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * Repository encapsulating all Prisma access for the FaqItem model (TASK-242).
 * Services depend on this class — never on PrismaClient directly.
 */
@Injectable()
export class FaqRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all active FAQ items ordered by sortOrder (ascending), then createdAt
   * for a stable order among equal ranks. Backs the public `GET /api/faq`.
   */
  findAllActive(): Promise<FaqItem[]> {
    return this.prisma.faqItem.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * List every FAQ item (any status) ordered by sortOrder, with an optional
   * question search and opt-in pagination. Backs the admin list.
   *
   * With neither `page` nor `limit` the query keeps its pre-TASK-357 shape — no
   * `skip`/`take`, and `total` comes from the rows we already hold rather than a
   * second `count` round-trip. Ordering stays `sortOrder` ASC in every mode:
   * `sortOrder` is the operator's own hand-set order and the only ordering the
   * storefront honours, so a paginated admin page must slice that same sequence.
   */
  async findAllAdmin(
    params: FindAllAdminParams = {},
    client: FaqDbClient = this.prisma,
  ): Promise<PaginatedFaqItemsResult> {
    const where: Prisma.FaqItemWhereInput = {
      ...(params.search && { question: { contains: params.search, mode: 'insensitive' } }),
    };
    const orderBy: Prisma.FaqItemOrderByWithRelationInput[] = [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ];

    if (params.page === undefined && params.limit === undefined) {
      const items = await client.faqItem.findMany({ where, orderBy });
      return { items, total: items.length };
    }

    const limit = params.limit ?? DEFAULT_ADMIN_PAGE_SIZE;
    const skip = ((params.page ?? 1) - 1) * limit;

    const [items, total] = await Promise.all([
      client.faqItem.findMany({ where, orderBy, skip, take: limit }),
      client.faqItem.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Rewrite the complete ordering of the FAQ list and return the refreshed admin list,
   * read inside the same transaction (TASK-428).
   *
   * Throws the domain errors of `common/reorder/reorder.errors.ts`; the service maps them.
   */
  reorderAll(orderedIds: readonly string[]): Promise<PaginatedFaqItemsResult> {
    return reorderBucket<PaginatedFaqItemsResult>(this.prisma, {
      resource: LOCK_RESOURCE,
      bucket: null,
      orderedIds,
      snapshot: (tx) => tx.faqItem.findMany({ select: { id: true } }),
      delegate: (tx) => tx.faqItem,
      result: (tx) => this.findAllAdmin({}, tx),
    });
  }

  /**
   * Find a FAQ item by ID. Returns the record or null if not found.
   */
  findById(id: string): Promise<FaqItem | null> {
    return this.prisma.faqItem.findUnique({ where: { id } });
  }

  /**
   * Create a new FAQ item, APPENDED to the END of the list (`sortOrder = max + 1`, `0`
   * for the first item) — TASK-428. `isActive` still defaults to true.
   *
   * The old `data.sortOrder ?? 0` default put every new question ON TOP OF the first one
   * the moment the admin form stopped sending a hand-typed number (which the reorder UI
   * removes): the whole list would sit at slot 0 and its order would be DB-arbitrary.
   * Same shape as `BannerRepository.create` — the `max + 1` read runs INSIDE a transaction
   * holding the list's advisory lock, so it cannot race a concurrent append (two items
   * handed the same slot) or a concurrent `reorderAll`.
   *
   * An EXPLICIT `data.sortOrder` still wins — the append is only the default.
   */
  create(data: CreateFaqItemInput): Promise<FaqItem> {
    return this.prisma.$transaction(async (tx) => {
      await acquireAdvisoryLocks(tx, [FAQ_LOCK_KEY]);

      const sortOrder = data.sortOrder ?? (await this.nextSortOrder(tx));

      return tx.faqItem.create({
        data: {
          question: data.question,
          answer: data.answer,
          sortOrder,
          isActive: data.isActive ?? true,
        },
      });
    });
  }

  /** The append slot of the FAQ list: `max(sortOrder) + 1`, or 0 when it is empty. */
  private async nextSortOrder(tx: ReorderTx): Promise<number> {
    const { _max } = await tx.faqItem.aggregate({ _max: { sortOrder: true } });
    return _max.sortOrder === null ? 0 : _max.sortOrder + 1;
  }

  /**
   * Update a FAQ item's fields. Only provided fields are written.
   */
  update(id: string, data: UpdateFaqItemInput): Promise<FaqItem> {
    return this.prisma.faqItem.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a FAQ item permanently. (FAQ has no audit-tombstone requirement —
   * removing a question is a plain delete, unlike User/Product/Order.)
   */
  delete(id: string): Promise<FaqItem> {
    return this.prisma.faqItem.delete({ where: { id } });
  }
}
