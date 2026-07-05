import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  constructor(private readonly pageRepository: PageRepository) {}

  /**
   * List published pages (public storefront).
   */
  async findAll(query: PageListQueryDto): Promise<PaginatedPagesResponse> {
    const params: FindAllParams = {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };

    const { pages, total } = await this.pageRepository.findAll(params);

    return {
      data: pages.map((page) => PageEntity.fromPrisma(page)),
      meta: this.buildMeta(total, params.page, params.limit),
    };
  }

  /**
   * Get a single published page by slug (public).
   * Throws NotFoundException when the page is missing or unpublished.
   */
  async findPublishedBySlug(slug: string): Promise<PageEntity> {
    const page = await this.pageRepository.findBySlug(slug);

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
      isActive: query.isActive,
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

    const existing = await this.pageRepository.findBySlugAny(slug);
    if (existing) {
      throw new ConflictException('Slug is already taken');
    }

    const input: CreatePageInput = {
      slug,
      title: dto.title,
      content: sanitizeRichText(dto.content),
      excerpt: dto.excerpt,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      isActive: dto.isActive,
      sortOrder: dto.sortOrder,
    };

    try {
      const page = await this.pageRepository.create(input);
      return PageEntity.fromPrisma(page);
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

    const input: UpdatePageInput = {
      slug: dto.slug,
      title: dto.title,
      // Only sanitize when content is actually being written; leave `undefined`
      // untouched so a partial update never blanks the stored body.
      content: dto.content !== undefined ? sanitizeRichText(dto.content) : undefined,
      excerpt: dto.excerpt,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      isActive: dto.isActive,
      sortOrder: dto.sortOrder,
    };

    try {
      const updated = await this.pageRepository.update(id, input);
      return PageEntity.fromPrisma(updated);
    } catch (error) {
      this.rethrowUniqueConflict(error);
    }
  }

  /**
   * Publish a page (isActive = true). Throws NotFoundException when not found.
   */
  async publish(id: string): Promise<PageEntity> {
    await this.ensureExists(id);
    const page = await this.pageRepository.publish(id);
    return PageEntity.fromPrisma(page);
  }

  /**
   * Unpublish a page (isActive = false). Throws NotFoundException when not found.
   */
  async unpublish(id: string): Promise<PageEntity> {
    await this.ensureExists(id);
    const page = await this.pageRepository.unpublish(id);
    return PageEntity.fromPrisma(page);
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
