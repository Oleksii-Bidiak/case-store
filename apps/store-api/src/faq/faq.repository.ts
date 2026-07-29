import { Injectable } from '@nestjs/common';
import { FaqItem, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';

/** Page size used when the admin asks for a page but names no `limit` (TASK-357). */
const DEFAULT_ADMIN_PAGE_SIZE = 20;

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
  async findAllAdmin(params: FindAllAdminParams = {}): Promise<PaginatedFaqItemsResult> {
    const where: Prisma.FaqItemWhereInput = {
      ...(params.search && { question: { contains: params.search, mode: 'insensitive' } }),
    };
    const orderBy: Prisma.FaqItemOrderByWithRelationInput[] = [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ];

    if (params.page === undefined && params.limit === undefined) {
      const items = await this.prisma.faqItem.findMany({ where, orderBy });
      return { items, total: items.length };
    }

    const limit = params.limit ?? DEFAULT_ADMIN_PAGE_SIZE;
    const skip = ((params.page ?? 1) - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.faqItem.findMany({ where, orderBy, skip, take: limit }),
      this.prisma.faqItem.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Find a FAQ item by ID. Returns the record or null if not found.
   */
  findById(id: string): Promise<FaqItem | null> {
    return this.prisma.faqItem.findUnique({ where: { id } });
  }

  /**
   * Create a new FAQ item. `sortOrder` and `isActive` default to 0 / true.
   */
  create(data: CreateFaqItemInput): Promise<FaqItem> {
    return this.prisma.faqItem.create({
      data: {
        question: data.question,
        answer: data.answer,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });
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
