import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, PublishStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import {
  BlogRepository,
  CreateBlogPostInput,
  UpdateBlogPostInput,
  FindAllPostsParams,
  FindAllAdminPostsParams,
} from './blog.repository';
import { BlogPostEntity, BlogCategoryEntity } from './entities';
import {
  CreateBlogPostDto,
  UpdateBlogPostDto,
  BlogPostListQueryDto,
  AdminBlogPostListQueryDto,
  CreateBlogCategoryDto,
  UpdateBlogCategoryDto,
  ReorderBlogCategoriesDto,
} from './dto';
import { generateSlug } from '../common/utils';
import { sanitizeRichText } from '../common/sanitize';
import { RevalidationNotifier, resolvePublishState, type RevalidateTarget } from '../publishing';
import { reorderErrorToHttp } from '../common/reorder';

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface PaginatedPostsResponse {
  data: BlogPostEntity[];
  meta: PaginationMeta;
}

@Injectable()
export class BlogService {
  constructor(
    private readonly blogRepository: BlogRepository,
    private readonly revalidation: RevalidationNotifier,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BlogService.name);
  }

  // ─── posts: public ──────────────────────────────────────────────────────────

  /** List PUBLISHED posts (public storefront) with category/search/pagination. */
  async findAll(query: BlogPostListQueryDto): Promise<PaginatedPostsResponse> {
    const params: FindAllPostsParams = {
      page: query.page ?? 1,
      limit: query.limit ?? 9,
      category: query.category,
      q: query.q,
    };

    const { posts, total } = await this.blogRepository.findAll(params);

    return {
      data: posts.map((post) => BlogPostEntity.fromPrisma(post)),
      meta: this.buildMeta(total, params.page, params.limit),
    };
  }

  /** Get a single PUBLISHED post by slug (public). 404 when missing / unpublished. */
  async findPublishedBySlug(slug: string): Promise<BlogPostEntity> {
    const post = await this.blogRepository.findPublishedBySlug(slug);
    if (!post) {
      throw new NotFoundException('Blog post not found');
    }
    return BlogPostEntity.fromPrisma(post);
  }

  // ─── posts: admin ───────────────────────────────────────────────────────────

  /** List all posts (any status) with an optional status filter (admin). */
  async findAllAdmin(query: AdminBlogPostListQueryDto): Promise<PaginatedPostsResponse> {
    const params: FindAllAdminPostsParams = {
      page: query.page ?? 1,
      limit: query.limit ?? 9,
      category: query.category,
      q: query.q,
      status: query.status,
    };

    const { posts, total } = await this.blogRepository.findAllAdmin(params);

    return {
      data: posts.map((post) => BlogPostEntity.fromPrisma(post)),
      meta: this.buildMeta(total, params.page, params.limit),
    };
  }

  /** Get a post by ID (admin). 404 when not found. */
  async findByIdAdmin(id: string): Promise<BlogPostEntity> {
    const post = await this.blogRepository.findById(id);
    if (!post) {
      throw new NotFoundException('Blog post not found');
    }
    return BlogPostEntity.fromPrisma(post);
  }

  /**
   * Create a post (admin). Auto-generates the slug from the title when omitted,
   * validates the category exists, sanitizes the HTML body, and resolves publish
   * state. Revalidates the storefront when the new post is published.
   */
  async create(dto: CreateBlogPostDto): Promise<BlogPostEntity> {
    const slug = dto.slug ?? generateSlug(dto.title);

    const existing = await this.blogRepository.findBySlugAny(slug);
    if (existing) {
      throw new ConflictException('Slug is already taken');
    }

    await this.ensureCategoryExists(dto.categoryId);

    const publishState = resolvePublishState(
      {
        status: dto.status ?? PublishStatus.DRAFT,
        scheduledAt: this.parseScheduledAt(dto.scheduledAt),
      },
      new Date(),
    );

    const input: CreateBlogPostInput = {
      slug,
      title: dto.title,
      excerpt: dto.excerpt,
      content: sanitizeRichText(dto.content),
      categoryId: dto.categoryId,
      authorName: dto.authorName,
      coverImageUrl: dto.coverImageUrl,
      coverBlurDataUrl: dto.coverBlurDataUrl,
      readingMinutes: dto.readingMinutes,
      featured: dto.featured,
      status: publishState.status,
      publishedAt: publishState.publishedAt,
      scheduledAt: publishState.scheduledAt,
    };

    try {
      const post = await this.blogRepository.create(input);
      const entity = BlogPostEntity.fromPrisma(post);
      if (entity.status === PublishStatus.PUBLISHED) {
        await this.notifyRevalidationForSlug(entity.slug);
      }
      return entity;
    } catch (error) {
      this.rethrowUniqueConflict(error);
    }
  }

  /**
   * Update a post (admin). Guards slug uniqueness on change, validates the
   * category when moved, sanitizes content when present, resolves publish state
   * when `status` is sent, and revalidates whenever public visibility could
   * change (published now, was published before, or a published post's content
   * changed).
   */
  async update(id: string, dto: UpdateBlogPostDto): Promise<BlogPostEntity> {
    const post = await this.blogRepository.findById(id);
    if (!post) {
      throw new NotFoundException('Blog post not found');
    }

    if (dto.slug !== undefined && dto.slug !== post.slug) {
      const existing = await this.blogRepository.findBySlugAny(dto.slug);
      if (existing && existing.id !== id) {
        throw new ConflictException('Slug is already taken');
      }
    }

    if (dto.categoryId !== undefined && dto.categoryId !== post.categoryId) {
      await this.ensureCategoryExists(dto.categoryId);
    }

    const wasPublished = post.status === PublishStatus.PUBLISHED;

    // Record a 301 redirect only when the post was publicly visible BEFORE
    // this write and the slug is actually changing (plan 147 §Design
    // Decision 3) — a draft's URL was never reachable, so no redirect.
    const isSlugRename = dto.slug !== undefined && dto.slug !== post.slug;
    const slugRename =
      wasPublished && isSlugRename && dto.slug !== undefined
        ? { oldSlug: post.slug, newSlug: dto.slug }
        : undefined;

    const input: UpdateBlogPostInput = {
      slug: dto.slug,
      title: dto.title,
      excerpt: dto.excerpt,
      // Only sanitize when content is actually being written; leave `undefined`
      // untouched so a partial update never blanks the stored body.
      content: dto.content !== undefined ? sanitizeRichText(dto.content) : undefined,
      categoryId: dto.categoryId,
      authorName: dto.authorName,
      coverImageUrl: dto.coverImageUrl,
      coverBlurDataUrl: dto.coverBlurDataUrl,
      readingMinutes: dto.readingMinutes,
      featured: dto.featured,
    };

    if (dto.status !== undefined) {
      const resolved = resolvePublishState(
        { status: dto.status, scheduledAt: this.parseScheduledAt(dto.scheduledAt) },
        new Date(),
      );
      input.status = resolved.status;
      input.scheduledAt = resolved.scheduledAt;
      // Preserve the ORIGINAL publish time when the post was already live and
      // stays live — re-saving a published post must not reset publishedAt.
      input.publishedAt =
        resolved.status === PublishStatus.PUBLISHED && wasPublished && post.publishedAt
          ? post.publishedAt
          : resolved.publishedAt;
    }

    try {
      const updated = await this.blogRepository.update(id, input, slugRename);
      const entity = BlogPostEntity.fromPrisma(updated);
      // Revalidate whenever public visibility could have changed. If the slug was
      // renamed, purge the old slug too so its stale route is dropped.
      if (wasPublished || entity.status === PublishStatus.PUBLISHED) {
        const slugs = isSlugRename ? [post.slug, entity.slug] : [entity.slug];
        await this.notifyRevalidationForSlugs(slugs);
      }
      return entity;
    } catch (error) {
      this.rethrowUniqueConflict(error);
    }
  }

  /** Publish a post (status = PUBLISHED). */
  async publish(id: string): Promise<BlogPostEntity> {
    const post = await this.ensurePostExists(id);
    const publishedAt = post.status === PublishStatus.PUBLISHED ? post.publishedAt : new Date();
    const updated = await this.blogRepository.update(id, {
      status: PublishStatus.PUBLISHED,
      publishedAt: publishedAt ?? new Date(),
      scheduledAt: null,
    });
    const entity = BlogPostEntity.fromPrisma(updated);
    await this.notifyRevalidationForSlug(entity.slug);
    return entity;
  }

  /** Unpublish a post (status = DRAFT). */
  async unpublish(id: string): Promise<BlogPostEntity> {
    await this.ensurePostExists(id);
    const updated = await this.blogRepository.update(id, {
      status: PublishStatus.DRAFT,
      publishedAt: null,
      scheduledAt: null,
    });
    const entity = BlogPostEntity.fromPrisma(updated);
    // Purge the now-stale published copy from the storefront cache.
    await this.notifyRevalidationForSlug(entity.slug);
    return entity;
  }

  /** Hard-delete a post (admin). Revalidates when the post was public. */
  async delete(id: string): Promise<void> {
    const post = await this.ensurePostExists(id);
    await this.blogRepository.delete(id);
    if (post.status === PublishStatus.PUBLISHED) {
      await this.notifyRevalidationForSlug(post.slug);
    }
  }

  // ─── categories ─────────────────────────────────────────────────────────────

  /** List all categories (public + admin). */
  async findAllCategories(): Promise<BlogCategoryEntity[]> {
    const categories = await this.blogRepository.findAllCategories();
    return categories.map((c) => BlogCategoryEntity.fromPrisma(c));
  }

  async findCategoryById(id: string): Promise<BlogCategoryEntity> {
    const category = await this.blogRepository.findCategoryById(id);
    if (!category) {
      throw new NotFoundException('Blog category not found');
    }
    return BlogCategoryEntity.fromPrisma(category);
  }

  async createCategory(dto: CreateBlogCategoryDto): Promise<BlogCategoryEntity> {
    const slug = dto.slug ?? generateSlug(dto.name);
    const existing = await this.blogRepository.findCategoryBySlugAny(slug);
    if (existing) {
      throw new ConflictException('Slug is already taken');
    }

    try {
      const category = await this.blogRepository.createCategory({
        slug,
        name: dto.name,
      });
      return BlogCategoryEntity.fromPrisma(category);
    } catch (error) {
      this.rethrowUniqueConflict(error);
    }
  }

  async updateCategory(id: string, dto: UpdateBlogCategoryDto): Promise<BlogCategoryEntity> {
    const category = await this.blogRepository.findCategoryById(id);
    if (!category) {
      throw new NotFoundException('Blog category not found');
    }

    if (dto.slug !== undefined && dto.slug !== category.slug) {
      const existing = await this.blogRepository.findCategoryBySlugAny(dto.slug);
      if (existing && existing.id !== id) {
        throw new ConflictException('Slug is already taken');
      }
    }

    try {
      const updated = await this.blogRepository.updateCategory(id, {
        slug: dto.slug,
        name: dto.name,
      });
      // A renamed/re-slugged category changes what the blog hub renders.
      await this.revalidation.revalidate(this.collectionRevalidateTarget());
      return BlogCategoryEntity.fromPrisma(updated);
    } catch (error) {
      this.rethrowUniqueConflict(error);
    }
  }

  /**
   * Reorder the (single, global) blog-category list (admin, TASK-295) and return the
   * refreshed list, so the panel resyncs in one round-trip — exactly as the category tree's
   * reorder does.
   *
   * The category order is what the blog hub renders its filter strip from, so the
   * collection target (`tags: ['blog']`) is purged after the write — the same target
   * `updateCategory` / `deleteCategory` already use.
   */
  async reorderCategories(
    dto: ReorderBlogCategoriesDto,
    actorId?: string,
  ): Promise<BlogCategoryEntity[]> {
    let categories;
    try {
      categories = await this.blogRepository.reorderCategories(dto.orderedIds);
    } catch (error) {
      throw reorderErrorToHttp(error);
    }

    await this.revalidation.revalidate(this.collectionRevalidateTarget());

    this.logger.info(
      { event: 'blog-category.reorder', orderedIds: dto.orderedIds, actorId },
      'Blog categories reordered',
    );

    return categories.map((category) => BlogCategoryEntity.fromPrisma(category));
  }

  async deleteCategory(id: string): Promise<void> {
    const category = await this.blogRepository.findCategoryById(id);
    if (!category) {
      throw new NotFoundException('Blog category not found');
    }
    const inUse = await this.blogRepository.countPostsInCategory(id);
    if (inUse > 0) {
      throw new ConflictException('Category has posts and cannot be deleted');
    }
    await this.blogRepository.deleteCategory(id);
    await this.revalidation.revalidate(this.collectionRevalidateTarget());
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async ensurePostExists(id: string) {
    const post = await this.blogRepository.findById(id);
    if (!post) {
      throw new NotFoundException('Blog post not found');
    }
    return post;
  }

  private async ensureCategoryExists(categoryId: string): Promise<void> {
    const category = await this.blogRepository.findCategoryById(categoryId);
    if (!category) {
      throw new BadRequestException('Category does not exist');
    }
  }

  private buildMeta(total: number, page: number, limit: number): PaginationMeta {
    return { total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private parseScheduledAt(value?: string | null): Date | null {
    return value ? new Date(value) : null;
  }

  /** Model-wide revalidation target (hub only). */
  private collectionRevalidateTarget(): RevalidateTarget {
    return { tags: ['blog'], paths: ['/blog'] };
  }

  /** Revalidation target for one post (hub + the post's own route). */
  private revalidateTargetForSlug(slug: string): RevalidateTarget {
    return { tags: ['blog', `blog:${slug}`], paths: ['/blog', `/blog/${slug}`] };
  }

  private async notifyRevalidationForSlug(slug: string): Promise<void> {
    await this.revalidation.revalidate(this.revalidateTargetForSlug(slug));
  }

  private async notifyRevalidationForSlugs(slugs: string[]): Promise<void> {
    const tags = new Set<string>(['blog']);
    const paths = new Set<string>(['/blog']);
    for (const slug of slugs) {
      tags.add(`blog:${slug}`);
      paths.add(`/blog/${slug}`);
    }
    await this.revalidation.revalidate({ tags: [...tags], paths: [...paths] });
  }

  private rethrowUniqueConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Slug is already taken');
    }
    throw error;
  }
}
