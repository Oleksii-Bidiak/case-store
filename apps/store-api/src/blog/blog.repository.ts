import { Injectable } from '@nestjs/common';
import { BlogCategory, BlogPost, Prisma, PublishStatus, SlugRedirectEntity } from '@prisma/client';
import { PrismaService } from '../prisma';
import { SlugRedirectRepository } from '../slug-redirect';
import type { PublishablePort, RevalidateTarget } from '../publishing';

/**
 * Slugs of a rename being persisted by this update — when present, the write
 * additionally records a 301 redirect `oldSlug → newSlug` in the SlugRedirect
 * ledger, atomically with the post update (TASK-285-F). The service passes it
 * only when the post was publicly visible before the write (plan 147 §Design
 * Decision 3).
 */
export interface SlugRenameInput {
  oldSlug: string;
  newSlug: string;
}

/** A BlogPost row with its category relation eagerly included. */
export type BlogPostWithCategory = BlogPost & {
  category: Pick<BlogCategory, 'id' | 'slug' | 'name'>;
};

/** Common include so every returned post carries its category summary. */
const CATEGORY_INCLUDE = {
  category: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.BlogPostInclude;

/** Parameters for the public (published-only) post list. */
export interface FindAllPostsParams {
  page: number;
  limit: number;
  category?: string;
  q?: string;
}

/** Parameters for the admin post list (all statuses). */
export interface FindAllAdminPostsParams extends FindAllPostsParams {
  status?: PublishStatus;
}

/** Allowed fields for creating a post. Publish fields are pre-resolved by the service. */
export interface CreateBlogPostInput {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  categoryId: string;
  authorName: string;
  coverImageUrl?: string | null;
  coverBlurDataUrl?: string | null;
  readingMinutes?: number | null;
  featured?: boolean;
  status: PublishStatus;
  publishedAt: Date | null;
  scheduledAt: Date | null;
}

/** Allowed fields for updating a post. Only provided fields are written. */
export interface UpdateBlogPostInput {
  slug?: string;
  title?: string;
  excerpt?: string;
  content?: string;
  categoryId?: string;
  authorName?: string;
  coverImageUrl?: string | null;
  coverBlurDataUrl?: string | null;
  readingMinutes?: number | null;
  featured?: boolean;
  status?: PublishStatus;
  publishedAt?: Date | null;
  scheduledAt?: Date | null;
}

/** Result of a paginated post query. */
export interface PaginatedPostsResult {
  posts: BlogPostWithCategory[];
  total: number;
}

/** Allowed fields for creating a category. */
export interface CreateBlogCategoryInput {
  slug: string;
  name: string;
  sortOrder?: number;
}

/** Allowed fields for updating a category. */
export interface UpdateBlogCategoryInput {
  slug?: string;
  name?: string;
  sortOrder?: number;
}

/**
 * Repository encapsulating all Prisma access for the Blog models (posts +
 * categories). Services depend on this class — never on PrismaClient directly.
 *
 * Also implements {@link PublishablePort}: registered under
 * `PUBLISHABLE_REPOSITORY` so the PublishingScheduler flips due scheduled posts
 * live on its cron tick.
 */
@Injectable()
export class BlogRepository implements PublishablePort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slugRedirectRepository: SlugRedirectRepository,
  ) {}

  /** Cache target purged when scheduled posts go live (see PublishingScheduler). */
  readonly revalidateTarget: RevalidateTarget = {
    tags: ['blog'],
    paths: ['/blog'],
  };

  // ─── posts: public reads ────────────────────────────────────────────────────

  /**
   * Build the category + free-text search filters shared by the public and admin
   * lists (category filters by slug, `q` searches title + excerpt). The publish
   * gate is applied separately by each caller.
   */
  private buildSearchWhere(params: FindAllPostsParams): Prisma.BlogPostWhereInput {
    const { category, q } = params;
    return {
      ...(category ? { category: { slug: category } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { excerpt: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  /**
   * Find PUBLISHED posts with pagination, ordered newest-first (featured posts
   * float to the top). Public storefront use — `status = PUBLISHED` is the
   * single visibility gate.
   */
  async findAll(params: FindAllPostsParams): Promise<PaginatedPostsResult> {
    const { page, limit } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.BlogPostWhereInput = {
      status: PublishStatus.PUBLISHED,
      ...this.buildSearchWhere(params),
    };

    const [posts, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        include: CATEGORY_INCLUDE,
        skip,
        take: limit,
        orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return { posts, total };
  }

  /**
   * Find a single PUBLISHED post by slug. Drafts / scheduled posts resolve to
   * null (the service maps that to a 404).
   */
  findPublishedBySlug(slug: string): Promise<BlogPostWithCategory | null> {
    return this.prisma.blogPost.findFirst({
      where: { slug, status: PublishStatus.PUBLISHED },
      include: CATEGORY_INCLUDE,
    });
  }

  // ─── posts: admin reads ─────────────────────────────────────────────────────

  /** Find all posts (any status) with pagination + optional status filter. */
  async findAllAdmin(params: FindAllAdminPostsParams): Promise<PaginatedPostsResult> {
    const { page, limit, status } = params;
    const skip = (page - 1) * limit;
    // No forced PUBLISHED gate here — apply the admin's explicit status filter.
    const where: Prisma.BlogPostWhereInput = {
      ...this.buildSearchWhere(params),
      ...(status !== undefined ? { status } : {}),
    };

    const [posts, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        include: CATEGORY_INCLUDE,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return { posts, total };
  }

  /** Find a post by ID regardless of status (admin use). */
  findById(id: string): Promise<BlogPostWithCategory | null> {
    return this.prisma.blogPost.findUnique({ where: { id }, include: CATEGORY_INCLUDE });
  }

  /** Find a post by slug regardless of status — used to enforce slug uniqueness. */
  findBySlugAny(slug: string): Promise<BlogPost | null> {
    return this.prisma.blogPost.findUnique({ where: { slug } });
  }

  // ─── posts: writes ──────────────────────────────────────────────────────────

  /** Create a post. Unique-slug violation bubbles up for the service to map. */
  create(data: CreateBlogPostInput): Promise<BlogPostWithCategory> {
    return this.prisma.blogPost.create({
      data: {
        slug: data.slug,
        title: data.title,
        excerpt: data.excerpt,
        content: data.content,
        categoryId: data.categoryId,
        authorName: data.authorName,
        coverImageUrl: data.coverImageUrl ?? null,
        coverBlurDataUrl: data.coverBlurDataUrl ?? null,
        readingMinutes: data.readingMinutes ?? null,
        featured: data.featured ?? false,
        status: data.status,
        publishedAt: data.publishedAt,
        scheduledAt: data.scheduledAt,
      },
      include: CATEGORY_INCLUDE,
    });
  }

  /**
   * Update a post's provided fields.
   *
   * When `slugRename` is present (a publicly-visible post's slug is changing —
   * gated by the service, plan 147 §Design Decision 3), the update and the
   * slug-redirect chain-collapse write commit in ONE transaction. When absent,
   * the behavior is the pre-TASK-285 single-statement update (no transaction
   * on the hot, no-rename path).
   */
  update(
    id: string,
    data: UpdateBlogPostInput,
    slugRename?: SlugRenameInput,
  ): Promise<BlogPostWithCategory> {
    if (!slugRename) {
      return this.prisma.blogPost.update({
        where: { id },
        data,
        include: CATEGORY_INCLUDE,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.blogPost.update({
        where: { id },
        data,
        include: CATEGORY_INCLUDE,
      });
      await this.slugRedirectRepository.recordRename(
        tx,
        SlugRedirectEntity.BLOG_POST,
        slugRename.oldSlug,
        slugRename.newSlug,
      );
      return updated;
    });
  }

  /** Hard-delete a post (admin content, not user data — no tombstone). */
  delete(id: string): Promise<BlogPost> {
    return this.prisma.blogPost.delete({ where: { id } });
  }

  // ─── categories ─────────────────────────────────────────────────────────────

  /** List all categories, ordered by sortOrder then name. */
  findAllCategories(): Promise<BlogCategory[]> {
    return this.prisma.blogCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  findCategoryById(id: string): Promise<BlogCategory | null> {
    return this.prisma.blogCategory.findUnique({ where: { id } });
  }

  findCategoryBySlugAny(slug: string): Promise<BlogCategory | null> {
    return this.prisma.blogCategory.findUnique({ where: { slug } });
  }

  createCategory(data: CreateBlogCategoryInput): Promise<BlogCategory> {
    return this.prisma.blogCategory.create({
      data: { slug: data.slug, name: data.name, sortOrder: data.sortOrder ?? 0 },
    });
  }

  updateCategory(id: string, data: UpdateBlogCategoryInput): Promise<BlogCategory> {
    return this.prisma.blogCategory.update({ where: { id }, data });
  }

  deleteCategory(id: string): Promise<BlogCategory> {
    return this.prisma.blogCategory.delete({ where: { id } });
  }

  /** Number of posts referencing a category — guards deletion of a used category. */
  countPostsInCategory(categoryId: string): Promise<number> {
    return this.prisma.blogPost.count({ where: { categoryId } });
  }

  // ─── publishing ─────────────────────────────────────────────────────────────

  /**
   * {@link PublishablePort.publishDue} — flip every SCHEDULED post whose
   * `scheduledAt` has passed to PUBLISHED, stamping `publishedAt = now` and
   * clearing `scheduledAt`. Returns the count flipped.
   */
  async publishDue(now: Date): Promise<number> {
    const { count } = await this.prisma.blogPost.updateMany({
      where: {
        status: PublishStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      data: {
        status: PublishStatus.PUBLISHED,
        publishedAt: now,
        scheduledAt: null,
      },
    });
    return count;
  }
}
