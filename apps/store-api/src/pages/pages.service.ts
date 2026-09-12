import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PageKind, Prisma, PublishStatus } from '@prisma/client';
import {
  PageRepository,
  CreatePageInput,
  UpdatePageInput,
  FindAllParams,
  FindAllAdminParams,
} from './pages.repository';
import { PageEntity } from './entities';
import { CreatePageDto, UpdatePageDto, PageListQueryDto, AdminPageListQueryDto } from './dto';
import { generateSlug } from '../common/utils';
import { sanitizeRichText } from '../common/sanitize';
import { RevalidationNotifier, resolvePublishState, type RevalidateTarget } from '../publishing';
import { HUB_SLUGS, hubRouteForSlug, revalidatePathsForPage } from './hub-routes';

/** A page identified well enough to purge its storefront routes. */
interface PageRef {
  slug: string;
  kind: PageKind;
}

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
 * Paginated response envelope for page lists.
 */
interface PaginatedPagesResponse {
  data: PageEntity[];
  meta: PaginationMeta;
}

@Injectable()
export class PageService {
  constructor(
    private readonly pageRepository: PageRepository,
    private readonly revalidation: RevalidationNotifier,
  ) {}

  /**
   * List published pages (public storefront).
   */
  async findAll(query: PageListQueryDto): Promise<PaginatedPagesResponse> {
    const params: FindAllParams = {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      kind: query.kind,
    };

    const { pages, total } = await this.pageRepository.findAll(params);

    return {
      data: pages.map((page) => PageEntity.fromPrisma(page)),
      meta: this.buildMeta(total, params.page, params.limit),
    };
  }

  /**
   * Get a single published page by slug (public).
   * Throws NotFoundException when the page is missing, unpublished, or of a
   * different kind than the caller asked for — the storefront passes the kind
   * its route serves, so a help page can never answer a `/legal/<slug>` request
   * (TASK-435). A HUB row is never served here at all.
   */
  async findPublishedBySlug(slug: string, kind?: PageKind): Promise<PageEntity> {
    const page = await this.pageRepository.findBySlug(slug, kind);

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    return PageEntity.fromPrisma(page);
  }

  /**
   * List all pages including drafts (admin).
   */
  async findAllAdmin(query: AdminPageListQueryDto): Promise<PaginatedPagesResponse> {
    const params: FindAllAdminParams = {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      search: query.search,
      kind: query.kind,
    };

    const { pages, total } = await this.pageRepository.findAllAdmin(params);

    return {
      data: pages.map((page) => PageEntity.fromPrisma(page)),
      meta: this.buildMeta(total, params.page, params.limit),
    };
  }

  /**
   * Get a page by ID (admin). Throws NotFoundException when not found.
   */
  async findByIdAdmin(id: string): Promise<PageEntity> {
    const page = await this.pageRepository.findById(id);

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    return PageEntity.fromPrisma(page);
  }

  /**
   * Create a page (admin). Auto-generates the slug from the title when omitted
   * and translates a slug-uniqueness conflict into a ConflictException.
   */
  async create(dto: CreatePageDto): Promise<PageEntity> {
    const slug = dto.slug ?? generateSlug(dto.title);
    const kind = dto.kind ?? PageKind.LEGAL;
    this.assertHubSlug(kind, slug);

    const existing = await this.pageRepository.findBySlugAny(slug);
    if (existing) {
      throw new ConflictException('Slug is already taken');
    }

    const publishState = resolvePublishState(
      {
        status: dto.status ?? PublishStatus.DRAFT,
        scheduledAt: this.parseScheduledAt(dto.scheduledAt),
      },
      new Date(),
    );

    const input: CreatePageInput = {
      slug,
      kind,
      title: dto.title,
      content: sanitizeRichText(dto.content),
      excerpt: dto.excerpt,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      status: publishState.status,
      publishedAt: publishState.publishedAt,
      scheduledAt: publishState.scheduledAt,
      sortOrder: dto.sortOrder,
    };

    try {
      const page = await this.pageRepository.create(input);
      const entity = PageEntity.fromPrisma(page);
      if (entity.status === PublishStatus.PUBLISHED) {
        await this.notifyRevalidation(entity);
      }
      return entity;
    } catch (error) {
      this.rethrowUniqueConflict(error);
    }
  }

  /**
   * Update a page (admin). Guards slug uniqueness when the slug is changed.
   */
  async update(id: string, dto: UpdatePageDto): Promise<PageEntity> {
    const page = await this.pageRepository.findById(id);
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    if (dto.slug !== undefined && dto.slug !== page.slug) {
      const existing = await this.pageRepository.findBySlugAny(dto.slug);
      if (existing && existing.id !== id) {
        throw new ConflictException('Slug is already taken');
      }
    }

    // The kind and slug this row will HAVE after the write — either may be
    // absent from a partial update, and a hub is only valid as a pairing of the
    // two (kind HUB + one of the six hub slugs).
    const nextKind = dto.kind ?? page.kind;
    const nextSlug = dto.slug ?? page.slug;
    this.assertHubSlug(nextKind, nextSlug);

    const wasPublished = page.status === PublishStatus.PUBLISHED;

    // Record a 301 redirect only when the page was publicly visible BEFORE
    // this write and the slug is actually changing (plan 147 §Design
    // Decision 3) — a draft's URL was never reachable, so no redirect.
    const isSlugRename = dto.slug !== undefined && dto.slug !== page.slug;
    const slugRename =
      wasPublished && isSlugRename && dto.slug !== undefined
        ? { oldSlug: page.slug, newSlug: dto.slug }
        : undefined;

    const input: UpdatePageInput = {
      slug: dto.slug,
      kind: dto.kind,
      title: dto.title,
      // Only sanitize when content is actually being written; leave `undefined`
      // untouched so a partial update never blanks the stored body.
      content: dto.content !== undefined ? sanitizeRichText(dto.content) : undefined,
      excerpt: dto.excerpt,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      sortOrder: dto.sortOrder,
    };

    // Only touch publish fields when the admin actually sent a `status`.
    if (dto.status !== undefined) {
      const resolved = resolvePublishState(
        { status: dto.status, scheduledAt: this.parseScheduledAt(dto.scheduledAt) },
        new Date(),
      );
      input.status = resolved.status;
      input.scheduledAt = resolved.scheduledAt;
      // Preserve the ORIGINAL publish time when the page was already live and
      // stays live — re-saving a published page must not reset publishedAt.
      input.publishedAt =
        resolved.status === PublishStatus.PUBLISHED && wasPublished && page.publishedAt
          ? page.publishedAt
          : resolved.publishedAt;
    }

    try {
      const updated = await this.pageRepository.update(id, input, slugRename);
      const entity = PageEntity.fromPrisma(updated);
      // Revalidate whenever public visibility could have changed: the page is
      // live now, or it was live before (e.g. just unpublished). The page's
      // address BEFORE the write is purged alongside the one after it, so a slug
      // rename drops the stale route (and the fresh 301 is served at once —
      // mirrors BlogService, TASK-285-E) and a KIND change purges the surface the
      // page just left as well as the one it joined.
      if (wasPublished || entity.status === PublishStatus.PUBLISHED) {
        await this.notifyRevalidation(
          { slug: page.slug, kind: page.kind },
          { slug: entity.slug, kind: entity.kind },
        );
      }
      return entity;
    } catch (error) {
      this.rethrowUniqueConflict(error);
    }
  }

  /**
   * Publish a page (status = PUBLISHED). Throws NotFoundException when not found.
   */
  async publish(id: string): Promise<PageEntity> {
    await this.ensureExists(id);
    const page = await this.pageRepository.publish(id);
    const entity = PageEntity.fromPrisma(page);
    await this.notifyRevalidation(entity);
    return entity;
  }

  /**
   * Unpublish a page (status = DRAFT). Throws NotFoundException when not found.
   */
  async unpublish(id: string): Promise<PageEntity> {
    await this.ensureExists(id);
    const page = await this.pageRepository.unpublish(id);
    const entity = PageEntity.fromPrisma(page);
    // Purge the now-stale published copy from the storefront cache.
    await this.notifyRevalidation(entity);
    return entity;
  }

  /**
   * Hard-delete a page (admin). Throws NotFoundException when not found.
   */
  async delete(id: string): Promise<void> {
    await this.ensureExists(id);
    await this.pageRepository.delete(id);
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async ensureExists(id: string): Promise<void> {
    const page = await this.pageRepository.findById(id);
    if (!page) {
      throw new NotFoundException('Page not found');
    }
  }

  private buildMeta(total: number, page: number, limit: number): PaginationMeta {
    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Parse an ISO date string from the DTO into a Date (or null when absent). */
  private parseScheduledAt(value?: string | null): Date | null {
    return value ? new Date(value) : null;
  }

  /**
   * Reject a HUB row whose slug names no hub route (TASK-435).
   *
   * A HUB row's slug is not an address, it is the NAME of the storefront route
   * whose meta tags it carries. `kind: HUB, slug: "pro-nas"` would therefore be a
   * ghost: editable in the panel, attached to nothing, rendered nowhere — and
   * silently so, which is exactly the kind of defect nobody notices for months.
   * Only the two ways of creating one (create / update) can produce it, so both
   * pass through here.
   */
  private assertHubSlug(kind: PageKind, slug: string): void {
    if (kind === PageKind.HUB && !hubRouteForSlug(slug)) {
      throw new BadRequestException(
        `A HUB page describes an existing storefront hub, so its slug must be one of: ${HUB_SLUGS.join(', ')}`,
      );
    }
  }

  /**
   * Cache-revalidation target for one or more pages, by kind:
   * LEGAL → `/legal` + `/legal/<slug>`, INFO → `/info` + `/info/<slug>`,
   * HUB → the one hub route the row describes. Several refs merge into a single
   * purge (a rename or a kind change names the page twice — before and after).
   */
  private revalidateTargetForPages(refs: PageRef[]): RevalidateTarget {
    const tags = new Set<string>(['pages']);
    const paths = new Set<string>();
    for (const ref of refs) {
      tags.add(`page:${ref.slug}`);
      for (const path of revalidatePathsForPage(ref.kind, ref.slug)) {
        paths.add(path);
      }
    }
    return { tags: [...tags], paths: [...paths] };
  }

  /** Best-effort storefront revalidation after an admin write. Never throws. */
  private async notifyRevalidation(...refs: PageRef[]): Promise<void> {
    await this.revalidation.revalidate(this.revalidateTargetForPages(refs));
  }

  /**
   * Re-throw a Prisma unique-constraint violation (slug) as ConflictException;
   * any other error is re-thrown unchanged. `never` return keeps the call site
   * exhaustive for the type checker.
   */
  private rethrowUniqueConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Slug is already taken');
    }
    throw error;
  }
}
