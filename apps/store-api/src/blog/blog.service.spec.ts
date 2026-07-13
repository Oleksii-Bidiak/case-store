import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma, PublishStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { ReorderNotFoundError } from '../common/reorder';
import { BlogRepository } from './blog.repository';
import { BlogService } from './blog.service';
import { BlogPostEntity, BlogCategoryEntity } from './entities';
import { RevalidationNotifier } from '../publishing';

const category = { id: 'cat-1', slug: 'compare', name: 'Порівняння' };

const mockPost = {
  id: 'post-1',
  slug: 'iphone16-vs-15',
  title: 'iPhone 16 проти iPhone 15',
  excerpt: 'Розбір камер і автономності.',
  content: '<p>Hello</p>',
  coverImageUrl: null,
  coverBlurDataUrl: null,
  authorName: 'Олег Пилипенко',
  readingMinutes: 8,
  featured: true,
  categoryId: 'cat-1',
  status: PublishStatus.PUBLISHED,
  publishedAt: new Date('2026-06-28T00:00:00.000Z'),
  scheduledAt: null,
  createdAt: new Date('2026-06-28T00:00:00.000Z'),
  updatedAt: new Date('2026-06-28T00:00:00.000Z'),
  category,
};

const draftPost = {
  ...mockPost,
  id: 'post-2',
  slug: 'draft-post',
  status: PublishStatus.DRAFT,
  publishedAt: null,
  featured: false,
};

const repositoryMock = {
  findAll: jest.fn(),
  findPublishedBySlug: jest.fn(),
  findAllAdmin: jest.fn(),
  findById: jest.fn(),
  findBySlugAny: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findAllCategories: jest.fn(),
  findCategoryById: jest.fn(),
  findCategoryBySlugAny: jest.fn(),
  createCategory: jest.fn(),
  updateCategory: jest.fn(),
  deleteCategory: jest.fn(),
  countPostsInCategory: jest.fn(),
  reorderCategories: jest.fn(),
};

const revalidationMock = { revalidate: jest.fn() };

const pinoLoggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('BlogService', () => {
  let service: BlogService;

  beforeEach(async () => {
    jest.clearAllMocks();
    revalidationMock.revalidate.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlogService,
        { provide: BlogRepository, useValue: repositoryMock },
        { provide: RevalidationNotifier, useValue: revalidationMock },
        { provide: PinoLogger, useValue: pinoLoggerMock },
      ],
    }).compile();

    service = module.get<BlogService>(BlogService);
  });

  describe('findAll (public)', () => {
    it('returns published posts with pagination meta and forwards filters', async () => {
      repositoryMock.findAll.mockResolvedValue({ posts: [mockPost], total: 1 });

      const result = await service.findAll({ page: 1, limit: 9, category: 'compare', q: 'iphone' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toBeInstanceOf(BlogPostEntity);
      expect(result.data[0].category.slug).toBe('compare');
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 9, totalPages: 1 });
      expect(repositoryMock.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 9,
        category: 'compare',
        q: 'iphone',
      });
    });
  });

  describe('findPublishedBySlug (public gating)', () => {
    it('returns the post when published', async () => {
      repositoryMock.findPublishedBySlug.mockResolvedValue(mockPost);

      const result = await service.findPublishedBySlug('iphone16-vs-15');

      expect(result).toBeInstanceOf(BlogPostEntity);
      expect(result.slug).toBe('iphone16-vs-15');
    });

    it('throws NotFoundException when missing or unpublished (gate)', async () => {
      repositoryMock.findPublishedBySlug.mockResolvedValue(null);

      await expect(service.findPublishedBySlug('draft-post')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('auto-generates the slug, validates category, and sanitizes content', async () => {
      repositoryMock.findBySlugAny.mockResolvedValue(null);
      repositoryMock.findCategoryById.mockResolvedValue(category);
      repositoryMock.create.mockResolvedValue(draftPost);

      await service.create({
        title: 'iPhone 16 vs 15',
        excerpt: 'x',
        content: '<p>ok</p><script>alert(1)</script>',
        categoryId: 'cat-1',
        authorName: 'Олег',
      });

      expect(repositoryMock.findBySlugAny).toHaveBeenCalledWith('iphone-16-vs-15');
      const passed = repositoryMock.create.mock.calls[0][0] as { content: string };
      expect(passed.content).toContain('<p>ok</p>');
      expect(passed.content).not.toContain('script');
    });

    it('rejects an unknown category with BadRequestException', async () => {
      repositoryMock.findBySlugAny.mockResolvedValue(null);
      repositoryMock.findCategoryById.mockResolvedValue(null);

      await expect(
        service.create({
          title: 'T',
          excerpt: 'x',
          content: '<p>x</p>',
          categoryId: 'missing',
          authorName: 'A',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repositoryMock.create).not.toHaveBeenCalled();
    });

    it('defaults to DRAFT with no revalidation when status omitted', async () => {
      repositoryMock.findBySlugAny.mockResolvedValue(null);
      repositoryMock.findCategoryById.mockResolvedValue(category);
      repositoryMock.create.mockResolvedValue(draftPost);

      await service.create({
        title: 'Draft',
        excerpt: 'x',
        content: '<p>x</p>',
        categoryId: 'cat-1',
        authorName: 'A',
      });

      const passed = repositoryMock.create.mock.calls[0][0] as {
        status: PublishStatus;
        publishedAt: Date | null;
      };
      expect(passed.status).toBe(PublishStatus.DRAFT);
      expect(passed.publishedAt).toBeNull();
      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });

    it('stamps publishedAt and revalidates when created PUBLISHED', async () => {
      repositoryMock.findBySlugAny.mockResolvedValue(null);
      repositoryMock.findCategoryById.mockResolvedValue(category);
      repositoryMock.create.mockResolvedValue(mockPost);

      await service.create({
        title: 'iPhone 16 проти iPhone 15',
        excerpt: 'x',
        content: '<p>x</p>',
        categoryId: 'cat-1',
        authorName: 'A',
        status: PublishStatus.PUBLISHED,
      });

      const passed = repositoryMock.create.mock.calls[0][0] as {
        status: PublishStatus;
        publishedAt: Date | null;
      };
      expect(passed.status).toBe(PublishStatus.PUBLISHED);
      expect(passed.publishedAt).toBeInstanceOf(Date);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['blog', 'blog:iphone16-vs-15'] }),
      );
    });

    it('keeps a future SCHEDULED post queued (no revalidation)', async () => {
      repositoryMock.findBySlugAny.mockResolvedValue(null);
      repositoryMock.findCategoryById.mockResolvedValue(category);
      repositoryMock.create.mockResolvedValue(draftPost);
      const future = new Date(Date.now() + 86_400_000).toISOString();

      await service.create({
        title: 'Scheduled',
        excerpt: 'x',
        content: '<p>x</p>',
        categoryId: 'cat-1',
        authorName: 'A',
        status: PublishStatus.SCHEDULED,
        scheduledAt: future,
      });

      const passed = repositoryMock.create.mock.calls[0][0] as {
        status: PublishStatus;
        scheduledAt: Date | null;
      };
      expect(passed.status).toBe(PublishStatus.SCHEDULED);
      expect(passed.scheduledAt).toBeInstanceOf(Date);
      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the slug already exists', async () => {
      repositoryMock.findBySlugAny.mockResolvedValue(mockPost);

      await expect(
        service.create({
          title: 'iPhone 16 проти iPhone 15',
          excerpt: 'x',
          content: '<p>x</p>',
          categoryId: 'cat-1',
          authorName: 'A',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the post is missing', async () => {
      repositoryMock.findById.mockResolvedValue(null);
      await expect(service.update('missing', { title: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('sanitizes content on update and revalidates a published post', async () => {
      repositoryMock.findById.mockResolvedValue(mockPost);
      repositoryMock.update.mockResolvedValue(mockPost);

      await service.update('post-1', { content: '<p>keep</p><img src="x" onerror="hack()" />' });

      const passed = repositoryMock.update.mock.calls[0][1] as { content: string };
      expect(passed.content).toContain('<p>keep</p>');
      expect(passed.content).not.toContain('onerror');
      expect(revalidationMock.revalidate).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['blog', 'blog:iphone16-vs-15'] }),
      );
    });

    it('leaves content undefined when not provided (no blanking)', async () => {
      repositoryMock.findById.mockResolvedValue(mockPost);
      repositoryMock.update.mockResolvedValue(mockPost);

      await service.update('post-1', { title: 'Renamed' });

      const passed = repositoryMock.update.mock.calls[0][1] as { content?: string };
      expect(passed.content).toBeUndefined();
    });

    it('validates a moved category', async () => {
      repositoryMock.findById.mockResolvedValue(mockPost);
      repositoryMock.findCategoryById.mockResolvedValue(null);

      await expect(service.update('post-1', { categoryId: 'nope' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('preserves the original publishedAt when re-saving an already-PUBLISHED post', async () => {
      repositoryMock.findById.mockResolvedValue(mockPost);
      repositoryMock.update.mockResolvedValue(mockPost);

      await service.update('post-1', { status: PublishStatus.PUBLISHED });

      const passed = repositoryMock.update.mock.calls[0][1] as { publishedAt?: Date | null };
      expect(passed.publishedAt).toEqual(mockPost.publishedAt);
    });

    it('purges both old and new slug when a published post is renamed', async () => {
      repositoryMock.findById.mockResolvedValue(mockPost);
      repositoryMock.findBySlugAny.mockResolvedValue(null);
      repositoryMock.update.mockResolvedValue({ ...mockPost, slug: 'new-slug' });

      await service.update('post-1', { slug: 'new-slug' });

      const target = revalidationMock.revalidate.mock.calls[0][0] as { tags: string[] };
      expect(target.tags).toEqual(expect.arrayContaining(['blog:iphone16-vs-15', 'blog:new-slug']));
    });

    it('records a slug redirect when renaming a PUBLISHED post', async () => {
      repositoryMock.findById.mockResolvedValue(mockPost); // PUBLISHED
      repositoryMock.findBySlugAny.mockResolvedValue(null);
      repositoryMock.update.mockResolvedValue({ ...mockPost, slug: 'new-slug' });

      await service.update('post-1', { slug: 'new-slug' });

      expect(repositoryMock.update).toHaveBeenCalledWith(
        'post-1',
        expect.objectContaining({ slug: 'new-slug' }),
        { oldSlug: 'iphone16-vs-15', newSlug: 'new-slug' },
      );
    });

    it('does NOT record a redirect when renaming a DRAFT post', async () => {
      repositoryMock.findById.mockResolvedValue(draftPost); // DRAFT
      repositoryMock.findBySlugAny.mockResolvedValue(null);
      repositoryMock.update.mockResolvedValue({ ...draftPost, slug: 'new-slug' });

      await service.update('post-2', { slug: 'new-slug' });

      expect(repositoryMock.update).toHaveBeenCalledWith(
        'post-2',
        expect.objectContaining({ slug: 'new-slug' }),
        undefined,
      );
    });

    it('does NOT record a redirect when updating a published post without changing the slug', async () => {
      repositoryMock.findById.mockResolvedValue(mockPost); // PUBLISHED
      repositoryMock.update.mockResolvedValue({ ...mockPost, title: 'Renamed' });

      await service.update('post-1', { title: 'Renamed' });

      expect(repositoryMock.update).toHaveBeenCalledWith(
        'post-1',
        expect.objectContaining({ title: 'Renamed' }),
        undefined,
      );
    });
  });

  describe('publish / unpublish', () => {
    it('publish sets PUBLISHED and revalidates', async () => {
      repositoryMock.findById.mockResolvedValue(draftPost);
      repositoryMock.update.mockResolvedValue({ ...draftPost, status: PublishStatus.PUBLISHED });

      const result = await service.publish('post-2');

      expect(result.status).toBe(PublishStatus.PUBLISHED);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['blog', 'blog:draft-post'] }),
      );
    });

    it('unpublish sets DRAFT and revalidates', async () => {
      repositoryMock.findById.mockResolvedValue(mockPost);
      repositoryMock.update.mockResolvedValue({ ...mockPost, status: PublishStatus.DRAFT });

      const result = await service.unpublish('post-1');

      expect(result.status).toBe(PublishStatus.DRAFT);
      expect(revalidationMock.revalidate).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('hard-deletes and revalidates a published post', async () => {
      repositoryMock.findById.mockResolvedValue(mockPost);
      repositoryMock.delete.mockResolvedValue(mockPost);

      await service.delete('post-1');

      expect(repositoryMock.delete).toHaveBeenCalledWith('post-1');
      expect(revalidationMock.revalidate).toHaveBeenCalled();
    });

    it('does not revalidate when deleting a draft', async () => {
      repositoryMock.findById.mockResolvedValue(draftPost);
      repositoryMock.delete.mockResolvedValue(draftPost);

      await service.delete('post-2');

      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });
  });

  describe('categories', () => {
    it('lists categories', async () => {
      repositoryMock.findAllCategories.mockResolvedValue([
        { ...category, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
      ]);

      const result = await service.findAllCategories();

      expect(result[0]).toBeInstanceOf(BlogCategoryEntity);
    });

    it('creates a category with an auto slug', async () => {
      repositoryMock.findCategoryBySlugAny.mockResolvedValue(null);
      repositoryMock.createCategory.mockResolvedValue({
        ...category,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.createCategory({ name: 'Порівняння' });

      expect(repositoryMock.createCategory).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Порівняння' }),
      );
    });

    it('refuses to delete a category that still has posts', async () => {
      repositoryMock.findCategoryById.mockResolvedValue(category);
      repositoryMock.countPostsInCategory.mockResolvedValue(3);

      await expect(service.deleteCategory('cat-1')).rejects.toThrow(ConflictException);
      expect(repositoryMock.deleteCategory).not.toHaveBeenCalled();
    });

    it('deletes an empty category and revalidates the hub', async () => {
      repositoryMock.findCategoryById.mockResolvedValue(category);
      repositoryMock.countPostsInCategory.mockResolvedValue(0);
      repositoryMock.deleteCategory.mockResolvedValue(category);

      await service.deleteCategory('cat-1');

      expect(repositoryMock.deleteCategory).toHaveBeenCalledWith('cat-1');
      expect(revalidationMock.revalidate).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['blog'] }),
      );
    });

    it('translates a Prisma P2002 race into ConflictException on create', async () => {
      repositoryMock.findCategoryBySlugAny.mockResolvedValue(null);
      repositoryMock.createCategory.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '7.0.0',
        }),
      );

      await expect(service.createCategory({ name: 'Dup', slug: 'dup' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── reorderCategories (TASK-295) ───────────────────────────────────────────

  describe('reorderCategories', () => {
    const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    const catRow = (id: string, sortOrder: number) => ({
      id,
      slug: `c-${sortOrder}`,
      name: `C${sortOrder}`,
      sortOrder,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    it('returns the refreshed list and purges the blog collection tag', async () => {
      repositoryMock.reorderCategories.mockResolvedValue([catRow(b, 0), catRow(a, 1)]);

      const result = await service.reorderCategories({ orderedIds: [b, a] }, 'admin-1');

      expect(repositoryMock.reorderCategories).toHaveBeenCalledWith([b, a]);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(BlogCategoryEntity);
      expect(result[0].id).toBe(b);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith({
        tags: ['blog'],
        paths: ['/blog'],
      });
    });

    it('maps an unknown id onto a 404 and does not revalidate', async () => {
      repositoryMock.reorderCategories.mockRejectedValue(new ReorderNotFoundError());

      await expect(
        service.reorderCategories({ orderedIds: [a] }, 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });
  });
});
