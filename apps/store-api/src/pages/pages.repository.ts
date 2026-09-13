import { Injectable } from '@nestjs/common';
import { Page, PageKind, Prisma, PublishStatus, SlugRedirectEntity } from '@prisma/client';
import { PrismaService } from '../prisma';
import { SlugRedirectRepository } from '../slug-redirect';
import type { PublishablePort, RevalidateTarget } from '../publishing';
import { PAGE_ROOT_PATHS } from './hub-routes';

/**
 * Kind clause shared by the two PUBLIC readers (list + detail).
 *
 * An explicit `kind` narrows to exactly that kind — this is what stops
 * `/legal/<slug>` from rendering an INFO page and the reverse. WITHOUT one the
 * query still excludes HUB, because a HUB row is not a page: it carries meta
 * tags for a route that already exists and has no address of its own. Letting it
 * answer `GET /api/pages/blog` would put an editable ghost document under
 * `/legal/blog`. The admin readers deliberately do not use this clause — the
 * panel is where hub rows are edited.
 */
function publicKindWhere(kind?: PageKind): Prisma.PageWhereInput {
  return kind ? { kind } : { kind: { not: PageKind.HUB } };
}

/**
 * Slugs of a rename being persisted by this update — when present, the write
 * additionally records a 301 redirect `oldSlug → newSlug` in the SlugRedirect
 * ledger, atomically with the page update (TASK-285-E). The service passes it
 * only when the page was publicly visible before the write (plan 147 §Design
 * Decision 3).
 */
export interface SlugRenameInput {
  oldSlug: string;
  newSlug: string;
}

/**
 * Parameters for the public (published-only) page list.
 */
export interface FindAllParams {
  page: number;
  limit: number;
  /** Narrow to one kind; omitted, every kind but HUB is returned. */
  kind?: PageKind;
}

/**
 * Parameters for the admin page list (all statuses), with an optional status
 * filter.
 */
export interface FindAllAdminParams {
  page: number;
  limit: number;
  status?: PublishStatus;
  search?: string;
  /** Backs the panel's kind tabs; omitted, EVERY kind is returned (HUB included). */
  kind?: PageKind;
}

/**
 * Allowed fields for creating a page. Publish fields are pre-resolved by the
 * service via `resolvePublishState`; the repository derives the `isActive`
 * mirror from `status`.
 */
export interface CreatePageInput {
  slug: string;
  kind: PageKind;
  title: string;
  content: string;
  excerpt?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  keywords?: string[];
  ogImage?: string | null;
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
  kind?: PageKind;
  title?: string;
  content?: string;
  excerpt?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  /** Absent leaves the stored tags alone; `[]` clears them (TASK-437). */
  keywords?: string[];
  ogImage?: string | null;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly slugRedirectRepository: SlugRedirectRepository,
  ) {}

  /**
   * Cache target purged when scheduled pages go live (see PublishingScheduler).
   *
   * Deliberately coarse: the scheduler flips a whole BATCH of due rows in one
   * `updateMany` and never learns which ones, so it cannot know their kinds or
   * slugs. It therefore purges the `pages` tag plus every root path a page can
   * appear on — both page hubs and all six hub routes. Per-page precision lives
   * on the admin write path instead (PageService.revalidateTargetForPage), which
   * does know the row it just wrote.
   */
  readonly revalidateTarget: RevalidateTarget = {
    tags: ['pages'],
    paths: [...PAGE_ROOT_PATHS],
  };

  /**
   * Find all PUBLISHED pages with pagination. Ordered by sortOrder ascending,
   * then createdAt. Public storefront use — `status = PUBLISHED` is the single
   * visibility gate; `kind` narrows to one surface (see {@link publicKindWhere}).
   */
  async findAll(params: FindAllParams): Promise<PaginatedPagesResult> {
    const { page, limit, kind } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.PageWhereInput = {
      status: PublishStatus.PUBLISHED,
      ...publicKindWhere(kind),
    };

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
   * null (the service maps that to a 404), and so does a kind mismatch — the
   * storefront's guarantee that `/legal/<slug>` never renders an INFO page.
   */
  findBySlug(slug: string, kind?: PageKind): Promise<Page | null> {
    return this.prisma.page.findFirst({
      where: { slug, status: PublishStatus.PUBLISHED, ...publicKindWhere(kind) },
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
   * Find all pages (any status) with pagination, an optional status filter and a
   * title/slug search. Admin listing.
   *
   * The search spans BOTH title and slug (TASK-357): an operator hunting for a legal
   * page usually remembers its URL (`/legal/dostavka`) rather than its exact heading.
   *
   * `kind` backs the panel's tabs. Unlike the public readers, an ABSENT kind here
   * means "every kind", HUB rows included — the panel is where they are edited.
   */
  async findAllAdmin(params: FindAllAdminParams): Promise<PaginatedPagesResult> {
    const { page, limit, status, search, kind } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.PageWhereInput = {
      ...(status !== undefined && { status }),
      ...(kind !== undefined && { kind }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search, mode: 'insensitive' } },
        ],
      }),
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
        kind: data.kind,
        title: data.title,
        content: data.content,
        excerpt: data.excerpt ?? null,
        metaTitle: data.metaTitle ?? null,
        metaDescription: data.metaDescription ?? null,
        keywords: data.keywords ?? [],
        ogImage: data.ogImage ?? null,
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
   *
   * When `slugRename` is present (a publicly-visible page's slug is changing —
   * gated by the service, plan 147 §Design Decision 3), the update and the
   * slug-redirect chain-collapse write commit in ONE transaction so the ledger
   * can never drift from the page's actual slug. When absent, the behavior is
   * byte-for-byte the pre-TASK-285 single-statement update (no transaction on
   * the hot, no-rename path).
   */
  update(id: string, data: UpdatePageInput, slugRename?: SlugRenameInput): Promise<Page> {
    const { status, ...rest } = data;
    const updateData: Prisma.PageUpdateInput = {
      ...rest,
      ...(status !== undefined && {
        status,
        isActive: status === PublishStatus.PUBLISHED,
      }),
    };

    if (!slugRename) {
      return this.prisma.page.update({ where: { id }, data: updateData });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.page.update({ where: { id }, data: updateData });
      await this.slugRedirectRepository.recordRename(
        tx,
        SlugRedirectEntity.PAGE,
        slugRename.oldSlug,
        slugRename.newSlug,
      );
      return updated;
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
