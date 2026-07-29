import { Injectable } from '@nestjs/common';
import { NewsletterRepository } from './newsletter.repository';
import { NewsletterSubscriptionEntity } from './entities';
import { NewsletterExportQueryDto, NewsletterListQueryDto, SubscribeDto } from './dto';

/**
 * Pagination metadata returned alongside paginated results.
 */
interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Paginated response envelope for subscriber lists.
 */
interface PaginatedSubscriptionsResponse {
  data: NewsletterSubscriptionEntity[];
  meta: PaginationMeta;
}

/** CSV header row for the subscriber export. */
const CSV_HEADER = ['email', 'status', 'source', 'createdAt'] as const;

@Injectable()
export class NewsletterService {
  constructor(private readonly newsletterRepository: NewsletterRepository) {}

  /**
   * Subscribe an email (public, idempotent). Normalization is handled by the DTO
   * `@Transform`, but we defensively normalize again so the service is correct
   * even when called directly (e.g. in tests). Returns `{ subscribed: true }`
   * regardless of whether the row was new or re-activated.
   */
  async subscribe(dto: SubscribeDto): Promise<{ subscribed: true }> {
    const email = this.normalizeEmail(dto.email);
    await this.newsletterRepository.subscribe(email, dto.source);
    return { subscribed: true };
  }

  /**
   * Unsubscribe an email (public, idempotent). Unsubscribing an unknown address
   * is a silent success — we never reveal whether an email was on record.
   */
  async unsubscribe(email: string): Promise<{ unsubscribed: true }> {
    await this.newsletterRepository.unsubscribe(this.normalizeEmail(email));
    return { unsubscribed: true };
  }

  /**
   * List subscribers (admin) with pagination, status filter, email search, and
   * sort.
   */
  async findAll(query: NewsletterListQueryDto): Promise<PaginatedSubscriptionsResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const { subscriptions, total } = await this.newsletterRepository.findAll({
      page,
      limit,
      status: query.status,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      data: subscriptions.map((row) => NewsletterSubscriptionEntity.fromPrisma(row)),
      meta: this.buildMeta(total, page, limit),
    };
  }

  /**
   * Build the subscriber CSV (admin export). Columns: email,status,source,createdAt.
   * Fields are quote-escaped so commas/quotes in values never break the layout.
   */
  async exportCsv(query: NewsletterExportQueryDto): Promise<string> {
    const rows = await this.newsletterRepository.findAllForExport({
      status: query.status,
      search: query.search,
    });

    const lines = [
      CSV_HEADER.join(','),
      ...rows.map((row) =>
        [
          this.escapeCsv(row.email),
          this.escapeCsv(row.status),
          this.escapeCsv(row.source ?? ''),
          this.escapeCsv(row.createdAt.toISOString()),
        ].join(','),
      ),
    ];

    return lines.join('\r\n');
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private buildMeta(total: number, page: number, limit: number): PaginationMeta {
    return { total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Escape a single CSV field per RFC 4180: wrap in double quotes and double any
   * embedded quotes when the value contains a comma, quote, or newline.
   */
  private escapeCsv(value: string): string {
    if (/[",\r\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
