import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FaqRepository,
  CreateFaqItemInput,
  UpdateFaqItemInput,
  FindAllAdminParams,
} from './faq.repository';
import { FaqItemEntity } from './entities';
import { CreateFaqItemDto, UpdateFaqItemDto, AdminFaqListQueryDto } from './dto';
import { RevalidationNotifier } from '../publishing';

/**
 * Cache tag purged on the storefront after every FAQ write. The storefront's
 * `faq-server.ts` fetch is tagged with the same value, so `revalidateTag('faq')`
 * refreshes every ISR page that reads it (`/info` and the PDP FAQPage JSON-LD).
 */
const FAQ_TAG = 'faq';

/**
 * Response envelope for a plain FAQ list.
 */
interface FaqListResponse {
  data: FaqItemEntity[];
}

/** Pagination metadata carried by the admin FAQ list response. */
interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Response envelope for the ADMIN FAQ list. `meta` is present even for an
 * unpaginated read so the panel can show a truthful row count without branching
 * on whether it asked for pages.
 */
interface AdminFaqListResponse {
  data: FaqItemEntity[];
  meta: PaginationMeta;
}

/**
 * Business logic for the global FAQ list (TASK-242). Thin over the repository:
 * existence checks on mutation and a storefront revalidation after every write.
 * Never touches PrismaClient directly.
 */
@Injectable()
export class FaqService {
  constructor(
    private readonly repository: FaqRepository,
    private readonly revalidation: RevalidationNotifier,
  ) {}

  /**
   * List all active FAQ items (public storefront). Ordered by sortOrder.
   */
  async findAllActive(): Promise<FaqListResponse> {
    const items = await this.repository.findAllActive();
    return { data: items.map((item) => FaqItemEntity.fromPrisma(item)) };
  }

  /**
   * List every FAQ item, any status (admin). Ordered by sortOrder, optionally
   * searched by question and paginated. Omitting `page`/`limit` returns the
   * complete list (TASK-357).
   */
  async findAllAdmin(query: AdminFaqListQueryDto = {}): Promise<AdminFaqListResponse> {
    const params: FindAllAdminParams = {
      page: query.page,
      limit: query.limit,
      search: query.search,
    };
    const { items, total } = await this.repository.findAllAdmin(params);

    return {
      data: items.map((item) => FaqItemEntity.fromPrisma(item)),
      meta: this.buildMeta(total, query.page, query.limit),
    };
  }

  /**
   * Get a FAQ item by ID (admin). Throws NotFoundException when not found.
   */
  async findById(id: string): Promise<FaqItemEntity> {
    const item = await this.repository.findById(id);
    if (!item) {
      throw new NotFoundException('FAQ item not found');
    }
    return FaqItemEntity.fromPrisma(item);
  }

  /**
   * Create a FAQ item (admin), then revalidate the `faq` tag.
   */
  async create(dto: CreateFaqItemDto): Promise<FaqItemEntity> {
    const input: CreateFaqItemInput = {
      question: dto.question,
      answer: dto.answer,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
    };

    const item = await this.repository.create(input);
    await this.revalidation.revalidate({ tags: [FAQ_TAG] });
    return FaqItemEntity.fromPrisma(item);
  }

  /**
   * Update a FAQ item (admin). Throws NotFoundException when the item is
   * missing, then revalidates the `faq` tag.
   */
  async update(id: string, dto: UpdateFaqItemDto): Promise<FaqItemEntity> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException('FAQ item not found');
    }

    const input: UpdateFaqItemInput = {
      question: dto.question,
      answer: dto.answer,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
    };

    const updated = await this.repository.update(id, input);
    await this.revalidation.revalidate({ tags: [FAQ_TAG] });
    return FaqItemEntity.fromPrisma(updated);
  }

  /**
   * Delete a FAQ item (admin). Throws NotFoundException when the item is
   * missing, then revalidates the `faq` tag. Returns the deleted id.
   */
  async remove(id: string): Promise<{ id: string }> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException('FAQ item not found');
    }

    await this.repository.delete(id);
    await this.revalidation.revalidate({ tags: [FAQ_TAG] });
    return { id };
  }

  /**
   * Pagination metadata. With no `limit` the whole list came back in one response,
   * so it is reported as a single page of size `total` rather than inventing a page
   * size the caller never asked for. An EMPTY unpaginated list would make that size
   * 0, so `totalPages` is short-circuited instead of dividing by zero.
   */
  private buildMeta(total: number, page?: number, limit?: number): PaginationMeta {
    const effectiveLimit = limit ?? total;

    return {
      total,
      page: page ?? 1,
      limit: effectiveLimit,
      totalPages: effectiveLimit === 0 ? 0 : Math.ceil(total / effectiveLimit),
    };
  }
}
