import { Injectable } from '@nestjs/common';
import { Page, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';

/**
 * Parameters for the public (published-only) page list.
 */
export interface FindAllParams {
  page: number;
  limit: number;
}

/**
 * Parameters for the admin page list (published + drafts).
 */
export interface FindAllAdminParams {
  page: number;
  limit: number;
  isActive?: boolean;
}

/**
 * Allowed fields for creating a page.
 * The service guarantees `slug` is present (auto-generated from title if omitted).
 */
export interface CreatePageInput {
  slug: string;
  title: string;
  content: string;
  excerpt?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

/**
 * Allowed fields for updating a page. Only provided fields are written.
 */
export interface UpdatePageInput {
  slug?: string;
  title?: string;
  content?: string;
  excerpt?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  isActive?: boolean;
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
 */
@Injectable()
export class PageRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find all published pages (isActive = true) with pagination.
   * Ordered by sortOrder ascending, then createdAt. Public storefront use.
   */
  async findAll(params: FindAllParams): Promise<PaginatedPagesResult> {
    const { page, limit } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.PageWhereInput = { isActive: true };

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
   * Find a single published page by slug. Drafts (isActive = false) are excluded,
   * so a draft slug resolves to null (the service maps that to a 404).
   */
  findBySlug(slug: string): Promise<Page | null> {
    return this.prisma.page.findFirst({ where: { slug, isActive: true } });
  }

  /**
   * Find a page by ID regardless of published state (admin use).
   */
  findById(id: string): Promise<Page | null> {
    return this.prisma.page.findUnique({ where: { id } });
  }

  /**
   * Find a page by slug regardless of published state — used by the service to
   * enforce slug uniqueness on create/update.
   */
  findBySlugAny(slug: string): Promise<Page | null> {
    return this.prisma.page.findUnique({ where: { slug } });
  }

  /**
   * Find all pages (published + drafts) with pagination and an optional
   * isActive filter. Admin listing.
   */
  async findAllAdmin(params: FindAllAdminParams): Promise<PaginatedPagesResult> {
    const { page, limit, isActive } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.PageWhereInput = {
      ...(isActive !== undefined && { isActive }),
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
   * up so the service can translate it into a ConflictException.
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
        isActive: data.isActive ?? false,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  /**
   * Update a page's fields. Only provided fields are written.
   */
  update(id: string, data: UpdatePageInput): Promise<Page> {
    return this.prisma.page.update({ where: { id }, data });
  }

  /**
   * Publish a page (isActive = true).
   */
  publish(id: string): Promise<Page> {
    return this.prisma.page.update({ where: { id }, data: { isActive: true } });
  }

  /**
   * Unpublish a page (isActive = false) — returns it to draft state.
   */
  unpublish(id: string): Promise<Page> {
    return this.prisma.page.update({ where: { id }, data: { isActive: false } });
  }

  /**
   * Hard-delete a page. Pages are admin content, not user data, so no tombstone.
   */
  delete(id: string): Promise<Page> {
    return this.prisma.page.delete({ where: { id } });
  }
}
