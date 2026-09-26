import { Injectable } from '@nestjs/common';
import {
  Author,
  BlogCategory,
  BlogPost,
  Prisma,
  PublishStatus,
  SlugRedirectEntity,
} from '@prisma/client';
import { PrismaService } from '../prisma';
import { SlugRedirectRepository } from '../slug-redirect';
import { ReorderTx, acquireAdvisoryLocks, lockKey, reorderBucket } from '../common/reorder';
import type { BlogPostSuggestionRow } from './entities';

/**
 * Advisory-lock namespace for blog categories (TASK-295). The prefix is MANDATORY — locks
 * are DATABASE-GLOBAL and every flat resource has a `__root__` bucket, so without it a blog
 * reorder would serialise against an unrelated resource's.
 */
const LOCK_RESOURCE = 'blog-categories';

/** Blog categories are ONE global list — a single, null-keyed bucket. */
const BUCKET_LOCK_KEY = lockKey(LOCK_RESOURCE, null);

/**
 * Listing clause for the PUBLIC post list (TASK-436) — the mirror of
 * `publicKindWhere()` in `pages.repository.ts`.
 *
 * `includeUnlisted = false` (what every LIST surface asks for) hides
 * `listed = false` rows. `includeUnlisted = true` (what `sitemap.xml` asks for)
 * returns every published post. There is no third mode and no default: the
 * argument is non-optional so both sides of the invariant stay written down at
 * each call site. Detail reads (`findPublishedBySlug`) never consult it at all —
 * an unlisted post's own URL must keep working.
 */
function listedWhere(includeUnlisted: boolean): Prisma.BlogPostWhereInput {
  return includeUnlisted ? {} : { listed: true };
}

/** Page size used when the admin asks for a page but names no `limit` (TASK-357). */
const DEFAULT_ADMIN_PAGE_SIZE = 20;

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

/**
 * A BlogPost row with its category (and, since TASK-554, its author) eagerly
 * included. `author` is optional in the TYPE only so fixtures that predate the
 * relation still type-check; every read below includes it.
 */
export type BlogPostWithCategory = BlogPost & {
  category: Pick<BlogCategory, 'id' | 'slug' | 'name'>;
  author?: Pick<Author, 'id' | 'name' | 'role' | 'bio'> | null;
};

/** Common include so every returned post carries its category and author summary. */
const POST_INCLUDE = {
  category: { select: { id: true, slug: true, name: true } },
  author: { select: { id: true, name: true, role: true, bio: true } },
} satisfies Prisma.BlogPostInclude;

/**
 * The columns a search-autocomplete suggestion is read with (TASK-543) — and
 * nothing else. `content` is the point: the header popup must not pull the
 * sanitised article bodies across the wire on every keystroke.
 */
const SUGGESTION_SELECT = {
  id: true,
  slug: true,
  title: true,
  coverImageUrl: true,
} satisfies Prisma.BlogPostSelect;

/**
 * Link key for a byline (TASK-554): the trimmed name, or null for a blank one.
 * The migration's backfill uses the same `btrim` so both paths agree.
 */
function authorKey(authorName: string): string | null {
  const name = authorName.trim();
  return name === '' ? null : name;
}

/**
 * Category + free-text + pagination filters shared by the public and the admin
 * post list. Deliberately carries NO visibility flag — see
 * {@link FindAllPostsParams}.
 */
export interface BlogPostSearchParams {
  page: number;
  limit: number;
  category?: string;
  q?: string;
}

/**
 * Parameters for the public (published-only) post list.
 *
 * `includeUnlisted` is REQUIRED, and that is the whole design (TASK-436). Two
 * consumers share this one read and need OPPOSITE answers:
 *
 *  - the `/blog` grid, the header search suggestions and "Читайте також" must
 *    NOT show `listed = false` posts;
 *  - `sitemap.xml` MUST list them — an unlisted post is still a public,
 *    indexable document, and dropping it from the sitemap is what would turn
 *    `listed` into the cloaking design the owner rejected (see the field's doc
 *    comment in schema.prisma).
 *
 * So neither default is safe: "filter by default" breaks the sitemap, "don't
 * filter by default" breaks the lists. Making the flag a required property means
 * a caller cannot silently inherit the wrong one — the code does not compile
 * until it states which side it is on. The admin list has its own params type
 * for the same reason: it is never subject to this flag.
 */
export interface FindAllPostsParams extends BlogPostSearchParams {
  includeUnlisted: boolean;
}

/** Parameters for the admin post list (all statuses). */
export interface FindAllAdminPostsParams extends BlogPostSearchParams {
  status?: PublishStatus;
}

/**
 * Parameters for the admin CATEGORY list. `page` / `limit` are OPTIONAL and
 * jointly opt-in: with both absent the read returns the complete list, which is
 * what the drag-and-drop reorder UI requires.
 */
export interface FindAllAdminCategoriesParams {
  page?: number;
  limit?: number;
  search?: string;
}

/** Result of an admin category query — `total` counts rows matching the filters. */
export interface PaginatedBlogCategoriesResult {
  categories: BlogCategory[];
  total: number;
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
  /** Listing visibility; omitted, the column default (`true`) applies. */
  listed?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  keywords?: string[];
  ogImage?: string | null;
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
  listed?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  /** Absent leaves the stored tags alone; `[]` clears them (TASK-437). */
  keywords?: string[];
  ogImage?: string | null;
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
 * NOT the scheduler's publishing port itself (TASK-525): `BlogPublisher` is, so
 * that a post flipped live by the cron is also indexed for search. This class
 * only supplies the flip, {@link publishDuePosts}.
 */
@Injectable()
export class BlogRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slugRedirectRepository: SlugRedirectRepository,
  ) {}

  // ─── posts: public reads ────────────────────────────────────────────────────

  /**
   * Build the category + free-text search filters shared by the public and admin
   * lists (category filters by slug, `q` searches title + excerpt). The publish
   * gate is applied separately by each caller.
   */
  private buildSearchWhere(params: BlogPostSearchParams): Prisma.BlogPostWhereInput {
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
   * publish gate, `listed` the listing gate (see {@link listedWhere}).
   */
  async findAll(params: FindAllPostsParams): Promise<PaginatedPostsResult> {
    const { page, limit } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.BlogPostWhereInput = {
      status: PublishStatus.PUBLISHED,
      ...listedWhere(params.includeUnlisted),
      ...this.buildSearchWhere(params),
    };

    const [posts, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        include: POST_INCLUDE,
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
   *
   * Deliberately ignores `listed`: an unlisted post is published and its own URL
   * must keep answering 200. Hiding it here is exactly the cloaking-adjacent
   * behaviour `listed` was chosen to avoid.
   */
  findPublishedBySlug(slug: string): Promise<BlogPostWithCategory | null> {
    return this.prisma.blogPost.findFirst({
      where: { slug, status: PublishStatus.PUBLISHED },
      include: POST_INCLUDE,
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
        include: POST_INCLUDE,
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
    return this.prisma.blogPost.findUnique({ where: { id }, include: POST_INCLUDE });
  }

  /**
   * Hydrate PUBLISHED posts for a set of ids (TASK-417) — the read behind a
   * search-index hit. The `PUBLISHED` gate is what makes trusting the index
   * safe: de-indexing on unpublish is best-effort, so a lingering document must
   * not be able to put a draft back on the hub. Order is NOT meaningful here
   * (Prisma returns rows in its own order); the caller re-applies the engine's
   * ranking.
   *
   * `includeUnlisted` is required for the same reason it is on
   * {@link FindAllPostsParams}, and for a sharper one: this read is the SECOND
   * path into the public list. The index knows nothing about `listed`, so
   * without this clause a `listed = false` post reappears the moment a visitor
   * types a word from it — on the very surfaces (`/blog`, the header
   * suggestions) the flag exists to keep it off. The two waves that created the
   * index and the flag landed on separate branches, so this is the one place
   * where they have to be told about each other.
   */
  findPublishedByIds(ids: string[], includeUnlisted: boolean): Promise<BlogPostWithCategory[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.blogPost.findMany({
      where: {
        id: { in: ids },
        status: PublishStatus.PUBLISHED,
        ...listedWhere(includeUnlisted),
      },
      include: POST_INCLUDE,
    });
  }

  // ─── posts: search-autocomplete suggestions (TASK-543) ──────────────────────

  /**
   * Suggestion rows for a set of search-index hits — the light twin of
   * {@link findPublishedByIds}. Same PUBLISHED + listed gate (a stale index
   * document must not surface a draft or an unlisted post in the header popup),
   * but a `select` of the four columns the popup renders instead of the full
   * row: no `content`, no category/author joins. Order is Prisma's; the caller
   * re-applies the engine's ranking.
   */
  findPublishedSuggestionsByIds(ids: string[]): Promise<BlogPostSuggestionRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.blogPost.findMany({
      where: {
        id: { in: ids },
        status: PublishStatus.PUBLISHED,
        ...listedWhere(false),
      },
      select: SUGGESTION_SELECT,
    });
  }

  /**
   * Postgres fallback for suggestions — the same `contains` scan over title and
   * excerpt, gate and ordering as the public list ({@link findAll}), minus the
   * count and the heavy columns. Always the LISTED set: suggestions are a list
   * surface (TASK-436).
   */
  findPublishedSuggestions(q: string, limit: number): Promise<BlogPostSuggestionRow[]> {
    return this.prisma.blogPost.findMany({
      where: {
        status: PublishStatus.PUBLISHED,
        ...listedWhere(false),
        ...this.buildSearchWhere({ page: 1, limit, q }),
      },
      select: SUGGESTION_SELECT,
      take: limit,
      orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Find a post by slug regardless of status — used to enforce slug uniqueness. */
  findBySlugAny(slug: string): Promise<BlogPost | null> {
    return this.prisma.blogPost.findUnique({ where: { slug } });
  }

  // ─── posts: writes ──────────────────────────────────────────────────────────

  /**
   * Resolve the Author row a byline links to (TASK-554), creating it on first
   * use — the admin form still takes a free-text name, so a new name is a new
   * author (with no role/bio until someone writes them). Blank byline → null.
   * The upsert has an empty `update` and a unique `where`, so Postgres runs it as
   * a native `INSERT … ON CONFLICT` and two concurrent first uses cannot collide.
   */
  private async linkAuthor(tx: Prisma.TransactionClient, authorName: string) {
    const name = authorKey(authorName);
    if (name === null) return null;
    const author = await tx.author.upsert({
      where: { name },
      update: {},
      create: { name },
      select: { id: true },
    });
    return author.id;
  }

  /**
   * Create a post, linked to its author in the same transaction (TASK-554).
   * Unique-slug violation bubbles up for the service to map.
   */
  create(data: CreateBlogPostInput): Promise<BlogPostWithCategory> {
    return this.prisma.$transaction(async (tx) => {
      const authorId = await this.linkAuthor(tx, data.authorName);
      return tx.blogPost.create({
        data: {
          slug: data.slug,
          title: data.title,
          excerpt: data.excerpt,
          content: data.content,
          categoryId: data.categoryId,
          authorName: data.authorName,
          authorId,
          coverImageUrl: data.coverImageUrl ?? null,
          coverBlurDataUrl: data.coverBlurDataUrl ?? null,
          readingMinutes: data.readingMinutes ?? null,
          featured: data.featured ?? false,
          listed: data.listed ?? true,
          metaTitle: data.metaTitle ?? null,
          metaDescription: data.metaDescription ?? null,
          keywords: data.keywords ?? [],
          ogImage: data.ogImage ?? null,
          status: data.status,
          publishedAt: data.publishedAt,
          scheduledAt: data.scheduledAt,
        },
        include: POST_INCLUDE,
      });
    });
  }

  /**
   * Update a post's provided fields.
   *
   * A transaction is opened only when the write has more than one statement:
   *  - `slugRename` present (a publicly-visible post's slug is changing — gated
   *    by the service, plan 147 §Design Decision 3): the slug-redirect
   *    chain-collapse write commits with the update;
   *  - `authorName` present: the post is re-linked to that name's Author row
   *    (TASK-554), so the byline and the bio card never name different people.
   * Otherwise it is the pre-TASK-285 single-statement update (no transaction on
   * the hot path).
   */
  update(
    id: string,
    data: UpdateBlogPostInput,
    slugRename?: SlugRenameInput,
  ): Promise<BlogPostWithCategory> {
    if (!slugRename && data.authorName === undefined) {
      return this.prisma.blogPost.update({
        where: { id },
        data,
        include: POST_INCLUDE,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const write: Prisma.BlogPostUncheckedUpdateInput =
        data.authorName === undefined
          ? data
          : { ...data, authorId: await this.linkAuthor(tx, data.authorName) };
      const updated = await tx.blogPost.update({
        where: { id },
        data: write,
        include: POST_INCLUDE,
      });
      if (slugRename) {
        await this.slugRedirectRepository.recordRename(
          tx,
          SlugRedirectEntity.BLOG_POST,
          slugRename.oldSlug,
          slugRename.newSlug,
        );
      }
      return updated;
    });
  }

  /** Hard-delete a post (admin content, not user data — no tombstone). */
  delete(id: string): Promise<BlogPost> {
    return this.prisma.blogPost.delete({ where: { id } });
  }

  // ─── categories ─────────────────────────────────────────────────────────────

  /**
   * List all categories, ordered by sortOrder then name.
   *
   * Accepts a transaction client (TASK-295) so the reorder endpoint can re-read the
   * refreshed list inside its own transaction.
   *
   * Backs the PUBLIC `GET /api/blog/categories` — deliberately left un-paginated and
   * un-searchable; the admin list has its own method below.
   */
  findAllCategories(client: PrismaService | ReorderTx = this.prisma): Promise<BlogCategory[]> {
    return client.blogCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Admin category list with an optional name search and opt-in pagination (TASK-357).
   *
   * With neither `page` nor `limit` this is `findAllCategories` plus a row count — no
   * `skip`/`take` and no second `count` round-trip. Ordering stays `sortOrder` ASC in
   * every mode: it is the operator's own hand-set order and the only one the blog hub
   * renders, so a paginated page must slice that same sequence.
   */
  async findAllCategoriesAdmin(
    params: FindAllAdminCategoriesParams = {},
  ): Promise<PaginatedBlogCategoriesResult> {
    const where: Prisma.BlogCategoryWhereInput = {
      ...(params.search && { name: { contains: params.search, mode: 'insensitive' } }),
    };
    const orderBy: Prisma.BlogCategoryOrderByWithRelationInput[] = [
      { sortOrder: 'asc' },
      { name: 'asc' },
    ];

    if (params.page === undefined && params.limit === undefined) {
      const categories = await this.prisma.blogCategory.findMany({ where, orderBy });
      return { categories, total: categories.length };
    }

    const limit = params.limit ?? DEFAULT_ADMIN_PAGE_SIZE;
    const skip = ((params.page ?? 1) - 1) * limit;

    const [categories, total] = await Promise.all([
      this.prisma.blogCategory.findMany({ where, orderBy, skip, take: limit }),
      this.prisma.blogCategory.count({ where }),
    ]);

    return { categories, total };
  }

  /**
   * Rewrite the complete ordering of the (single, global) blog-category list and return the
   * refreshed list, read inside the same transaction (TASK-295) — same shape as the
   * category tree's reorder, minus the tree.
   *
   * Throws the domain errors of `common/reorder/reorder.errors.ts`; the service maps them.
   */
  reorderCategories(orderedIds: readonly string[]): Promise<BlogCategory[]> {
    return reorderBucket<BlogCategory[]>(this.prisma, {
      resource: LOCK_RESOURCE,
      bucket: null,
      orderedIds,
      snapshot: (tx) => tx.blogCategory.findMany({ select: { id: true } }),
      delegate: (tx) => tx.blogCategory,
      result: (tx) => this.findAllCategories(tx),
    });
  }

  findCategoryById(id: string): Promise<BlogCategory | null> {
    return this.prisma.blogCategory.findUnique({ where: { id } });
  }

  findCategoryBySlugAny(slug: string): Promise<BlogCategory | null> {
    return this.prisma.blogCategory.findUnique({ where: { slug } });
  }

  /**
   * Create a category, APPENDED to the end of the list (`sortOrder = max + 1`, `0` when the
   * list is empty) — TASK-295.
   *
   * The old `data.sortOrder ?? 0` default lands every new category ON TOP OF the first one
   * once the admin form stops sending a hand-typed `sortOrder` (which the reorder UI
   * removes). Same shape as `CategoryRepository.create`: the `max + 1` read runs inside a
   * transaction holding the bucket's advisory lock, so it cannot race a concurrent append or
   * a concurrent `reorderCategories` and hand out a duplicate slot. An explicit
   * `data.sortOrder` still wins — the append is only the default.
   */
  createCategory(data: CreateBlogCategoryInput): Promise<BlogCategory> {
    return this.prisma.$transaction(async (tx) => {
      await acquireAdvisoryLocks(tx, [BUCKET_LOCK_KEY]);

      let sortOrder = data.sortOrder;
      if (sortOrder === undefined) {
        const { _max } = await tx.blogCategory.aggregate({ _max: { sortOrder: true } });
        sortOrder = _max.sortOrder === null ? 0 : _max.sortOrder + 1;
      }

      return tx.blogCategory.create({
        data: { slug: data.slug, name: data.name, sortOrder },
      });
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
   * Flip every SCHEDULED post whose `scheduledAt` has passed to PUBLISHED,
   * stamping `publishedAt = now` and clearing `scheduledAt`. Returns the ids
   * flipped (TASK-525) — `BlogPublisher` indexes exactly those.
   *
   * One `UPDATE … RETURNING`, not a read then a write: the ids are the rows this
   * statement changed, so a post an admin moves back to draft between two
   * statements can neither be flipped by mistake nor indexed by mistake.
   */
  async publishDuePosts(now: Date): Promise<string[]> {
    const rows = await this.prisma.blogPost.updateManyAndReturn({
      where: {
        status: PublishStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      data: {
        status: PublishStatus.PUBLISHED,
        publishedAt: now,
        scheduledAt: null,
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
