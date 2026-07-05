import { Injectable } from '@nestjs/common';
import { Page, Prisma, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import type { PublishablePort, RevalidateTarget } from '../publishing';

/**
 * Parameters for the public (published-only) page list.
 */
export interface FindAllParams {
  page: number;
  limit: number;
}

/**
 * Parameters for the admin page list (all statuses), with an optional status
 * filter.
 */
export interface FindAllAdminParams {
  page: number;
  limit: number;
  status?: PublishStatus;
}

/**
 * Allowed fields for creating a page. Publish fields are pre-resolved by the
 * service via `resolvePublishState`; the repository derives the `isActive`
 * mirror from `status`.
 */
export interface CreatePageInput {
  slug: string;
  title: string;
  content: string;
  excerpt?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  status: PublishStatus;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  sortOrder?: number;
}

/**
 * Allowed fields for updating a page. Only provided fields are written; when
 * `status` is provided the publish timestamps and the `isActive` mirror are
 * written alongside it.
 */
export interface UpdatePageInput {
  slug?: string;
  title?: string;
  content?: string;
  excerpt?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  status?: PublishStatus;
  publishedAt?: Date | null;
  scheduledAt?: Date | null;
  sortOrder?: number;
}

/**
 * Result of a paginated page query.
 */
export interface PaginatedPagesResult {
  pages: Page[];
  total: number;
}

/**
 * Repository encapsulating all Prisma access for the Page model.
 * Services depend on this class — never on PrismaClient directly.
 *
 * Also implements {@link PublishablePort}: it is registered under
 * `PUBLISHABLE_REPOSITORY` (multi) so the PublishingScheduler flips due
 * scheduled pages live on its cron tick.
 */
@Injectable()
export class PageRepository implements PublishablePort {
  constructor(private readonly prisma: PrismaService) {}

  /** Cache target purged when scheduled pages go live (see PublishingScheduler). */
  readonly revalidateTarget: RevalidateTarget = {
    tags: ['pages'],
    paths: ['/legal'],
  };

  /**
   * Find all PUBLISHED pages with pagination. Ordered by sortOrder ascending,
   * then createdAt. Public storefront use — `status = PUBLISHED` is the single
   * visibility gate.
   */
  async findAll(params: FindAllParams): Promise<PaginatedPagesResult> {
    const { page, limit } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.PageWhereInput = { status: PublishStatus.PUBLISHED };

    const [pages, total] = await Promise.all([
      this.prisma.page.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.page.count({ where }),
    ]);

    return { pages, total };
  }

  /**
   * Find a single PUBLISHED page by slug. Drafts / scheduled pages resolve to
   * null (the service maps that to a 404).
   */
  findBySlug(slug: string): Promise<Page | null> {
    return this.prisma.page.findFirst({
      where: { slug, status: PublishStatus.PUBLISHED },
    });
  }

  /**
   * Find a page by ID regardless of status (admin use).
   */
  findById(id: string): Promise<Page | null> {
    return this.prisma.page.findUnique({ where: { id } });
  }

  /**
   * Find a page by slug regardless of status — used by the service to enforce
   * slug uniqueness on create/update.
   */
  findBySlugAny(slug: string): Promise<Page | null> {
    return this.prisma.page.findUnique({ where: { slug } });
  }

  /**
   * Find all pages (any status) with pagination and an optional status filter.
   * Admin listing.
   */
  async findAllAdmin(params: FindAllAdminParams): Promise<PaginatedPagesResult> {
    const { page, limit, status } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.PageWhereInput = {
      ...(status !== undefined && { status }),
    };

    const [pages, total] = await Promise.all([
      this.prisma.page.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.page.count({ where }),
    ]);

    return { pages, total };
  }

  /**
   * Create a new page. The unique-constraint error on `slug` is left to bubble
   * up so the service can translate it into a ConflictException. `isActive` is
   * derived from `status` — never accepted from the caller.
   */
  create(data: CreatePageInput): Promise<Page> {
    return this.prisma.page.create({
      data: {
        slug: data.slug,
        title: data.title,
        content: data.content,
        excerpt: data.excerpt ?? null,
        metaTitle: data.metaTitle ?? null,
        metaDescription: data.metaDescription ?? null,
        status: data.status,
        publishedAt: data.publishedAt,
        scheduledAt: data.scheduledAt,
        isActive: data.status === PublishStatus.PUBLISHED,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  /**
   * Update a page's fields. Only provided fields are written; when `status`
   * changes the derived `isActive` mirror is written to match.
   */
  update(id: string, data: UpdatePageInput): Promise<Page> {
    const { status, ...rest } = data;
    return this.prisma.page.update({
      where: { id },
      data: {
        ...rest,
        ...(status !== undefined && {
          status,
          isActive: status === PublishStatus.PUBLISHED,
        }),
      },
    });
  }

  /**
   * Publish a page immediately: status = PUBLISHED, publishedAt = now,
   * scheduledAt cleared, isActive mirror = true.
   */
  publish(id: string, now: Date = new Date()): Promise<Page> {
    return this.prisma.page.update({
      where: { id },
      data: {
        status: PublishStatus.PUBLISHED,
        publishedAt: now,
        scheduledAt: null,
        isActive: true,
      },
    });
  }

  /**
   * Unpublish a page — returns it to DRAFT: publishedAt & scheduledAt cleared,
   * isActive mirror = false.
   */
  unpublish(id: string): Promise<Page> {
    return this.prisma.page.update({
      where: { id },
      data: {
        status: PublishStatus.DRAFT,
        publishedAt: null,
        scheduledAt: null,
        isActive: false,
      },
    });
  }

  /**
   * Hard-delete a page. Pages are admin content, not user data, so no tombstone.
   */
  delete(id: string): Promise<Page> {
    return this.prisma.page.delete({ where: { id } });
  }

  /**
   * {@link PublishablePort.publishDue} — flip every SCHEDULED page whose
   * `scheduledAt` has passed to PUBLISHED, stamping `publishedAt = now`, clearing
   * `scheduledAt`, and syncing the `isActive` mirror. Returns the count flipped.
   */
  async publishDue(now: Date): Promise<number> {
    const { count } = await this.prisma.page.updateMany({
      where: {
        status: PublishStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      data: {
        status: PublishStatus.PUBLISHED,
        publishedAt: now,
        scheduledAt: null,
        isActive: true,
      },
    });
    return count;
  }
}
