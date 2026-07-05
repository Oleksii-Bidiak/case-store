import { Injectable } from '@nestjs/common';
import { NewsletterStatus, NewsletterSubscription, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';

/**
 * Parameters for the admin subscriber list.
 */
export interface FindAllParams {
  page: number;
  limit: number;
  status?: NewsletterStatus;
  search?: string;
}

/**
 * Result of a paginated subscriber query.
 */
export interface PaginatedSubscriptionsResult {
  subscriptions: NewsletterSubscription[];
  total: number;
}

/**
 * Repository encapsulating all Prisma access for the NewsletterSubscription
 * model. Services depend on this class — never on PrismaClient directly.
 */
@Injectable()
export class NewsletterRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotently subscribe an email. Uses an upsert keyed on the unique email:
   *
   * - New address → creates a SUBSCRIBED row with the given source.
   * - Existing address (SUBSCRIBED or UNSUBSCRIBED) → re-activates it: status is
   *   forced back to SUBSCRIBED and `unsubscribedAt` cleared. `source` is only
   *   overwritten when a new one is supplied, preserving the original attribution
   *   otherwise.
   *
   * No duplicate row is ever created and re-subscribing never errors.
   */
  subscribe(email: string, source?: string): Promise<NewsletterSubscription> {
    return this.prisma.newsletterSubscription.upsert({
      where: { email },
      create: {
        email,
        status: NewsletterStatus.SUBSCRIBED,
        source: source ?? null,
      },
      update: {
        status: NewsletterStatus.SUBSCRIBED,
        unsubscribedAt: null,
        ...(source !== undefined && { source }),
      },
    });
  }

  /**
   * Mark an existing subscriber UNSUBSCRIBED (stamping `unsubscribedAt`). Returns
   * null when the email is not on record so the service can treat unsubscribing
   * an unknown address as a no-op success.
   */
  async unsubscribe(email: string, now: Date = new Date()): Promise<NewsletterSubscription | null> {
    const existing = await this.prisma.newsletterSubscription.findUnique({ where: { email } });
    if (!existing) {
      return null;
    }

    return this.prisma.newsletterSubscription.update({
      where: { email },
      data: { status: NewsletterStatus.UNSUBSCRIBED, unsubscribedAt: now },
    });
  }

  /** Find a subscriber by (normalized) email, or null. */
  findByEmail(email: string): Promise<NewsletterSubscription | null> {
    return this.prisma.newsletterSubscription.findUnique({ where: { email } });
  }

  /**
   * List subscribers with pagination, an optional status filter, and an optional
   * case-insensitive email search. Ordered newest first.
   */
  async findAll(params: FindAllParams): Promise<PaginatedSubscriptionsResult> {
    const { page, limit, status, search } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.NewsletterSubscriptionWhereInput = {
      ...(status !== undefined && { status }),
      ...(search && { email: { contains: search, mode: 'insensitive' } }),
    };

    const [subscriptions, total] = await Promise.all([
      this.prisma.newsletterSubscription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.newsletterSubscription.count({ where }),
    ]);

    return { subscriptions, total };
  }

  /**
   * Fetch every subscriber matching the filters (no pagination) for CSV export.
   * Ordered newest first to match the admin list.
   */
  findAllForExport(
    filters: Pick<FindAllParams, 'status' | 'search'> = {},
  ): Promise<NewsletterSubscription[]> {
    const { status, search } = filters;
    const where: Prisma.NewsletterSubscriptionWhereInput = {
      ...(status !== undefined && { status }),
      ...(search && { email: { contains: search, mode: 'insensitive' } }),
    };

    return this.prisma.newsletterSubscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}
