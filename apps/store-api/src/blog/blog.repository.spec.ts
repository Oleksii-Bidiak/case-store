import { Test, TestingModule } from '@nestjs/testing';
import { PublishStatus, SlugRedirectEntity } from '@prisma/client';
import { PrismaService } from '../prisma';
import { SlugRedirectRepository } from '../slug-redirect';
import { BlogRepository } from './blog.repository';
import { ReorderNotFoundError } from '../common/reorder';

/**
 * ONE blogCategory delegate shared by the singleton and the transaction client (TASK-295):
 * `createCategory` and `reorderCategories` write through `tx.blogCategory`, the plain reads
 * through `this.prisma.blogCategory`, and the assertions do not care which.
 */
const blogCategoryDelegate = {
  findMany: jest.fn(),
  count: jest.fn(),
  findUnique: jest.fn(),
  aggregate: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  delete: jest.fn(),
};

const txMock = {
  blogPost: {
    update: jest.fn(),
  },
  blogCategory: blogCategoryDelegate,
  // `pg_advisory_xact_lock` — taken by `createCategory` and by `reorderCategories`.
  $executeRaw: jest.fn(),
};

const prismaMock = {
  blogPost: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  blogCategory: blogCategoryDelegate,
  $transaction: jest.fn((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
};

const slugRedirectRepositoryMock = {
  recordRename: jest.fn(),
};

describe('BlogRepository', () => {
  let repository: BlogRepository;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlogRepository,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SlugRedirectRepository, useValue: slugRedirectRepositoryMock },
      ],
    }).compile();

    repository = module.get<BlogRepository>(BlogRepository);
  });

  describe('update (slug rename)', () => {
    it('never opens a transaction nor records a redirect when slugRename is absent', async () => {
      prismaMock.blogPost.update.mockResolvedValue({ id: 'post-1' });

      await repository.update('post-1', { title: 'Renamed' });

      expect(prismaMock.blogPost.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(slugRedirectRepositoryMock.recordRename).not.toHaveBeenCalled();
    });

    it('runs the post update + recordRename inside one transaction when slugRename is given', async () => {
      const renamed = { id: 'post-1', slug: 'new-slug' };
      txMock.blogPost.update.mockResolvedValue(renamed);

      const result = await repository.update(
        'post-1',
        { slug: 'new-slug' },
        { oldSlug: 'old-slug', newSlug: 'new-slug' },
      );

      expect(result).toBe(renamed);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.blogPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { slug: 'new-slug' },
        }),
      );
      expect(slugRedirectRepositoryMock.recordRename).toHaveBeenCalledWith(
        txMock,
        SlugRedirectEntity.BLOG_POST,
        'old-slug',
        'new-slug',
      );
      expect(prismaMock.blogPost.update).not.toHaveBeenCalled();
    });
  });

  describe('findAll (public)', () => {
    it('gates on PUBLISHED and computes skip from page/limit', async () => {
      prismaMock.blogPost.findMany.mockResolvedValue([]);
      prismaMock.blogPost.count.mockResolvedValue(0);

      await repository.findAll({ page: 2, limit: 9 });

      expect(prismaMock.blogPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: PublishStatus.PUBLISHED },
          skip: 9,
          take: 9,
        }),
      );
    });

    it('applies category and search filters', async () => {
      prismaMock.blogPost.findMany.mockResolvedValue([]);
      prismaMock.blogPost.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 9, category: 'guides', q: 'навушники' });

      const where = prismaMock.blogPost.findMany.mock.calls[0][0].where;
      expect(where.status).toBe(PublishStatus.PUBLISHED);
      expect(where.category).toEqual({ slug: 'guides' });
      expect(where.OR).toEqual([
        { title: { contains: 'навушники', mode: 'insensitive' } },
        { excerpt: { contains: 'навушники', mode: 'insensitive' } },
      ]);
    });
  });

  describe('findAllAdmin', () => {
    it('drops the PUBLISHED gate and applies the explicit status filter', async () => {
      prismaMock.blogPost.findMany.mockResolvedValue([]);
      prismaMock.blogPost.count.mockResolvedValue(0);

      await repository.findAllAdmin({ page: 1, limit: 9, status: PublishStatus.DRAFT });

      const where = prismaMock.blogPost.findMany.mock.calls[0][0].where;
      expect(where.status).toBe(PublishStatus.DRAFT);
    });

    it('lists every status when no status filter is given', async () => {
      prismaMock.blogPost.findMany.mockResolvedValue([]);
      prismaMock.blogPost.count.mockResolvedValue(0);

      await repository.findAllAdmin({ page: 1, limit: 9 });

      const where = prismaMock.blogPost.findMany.mock.calls[0][0].where;
      expect(where.status).toBeUndefined();
    });
  });

  describe('findPublishedBySlug', () => {
    it('queries by slug gated on PUBLISHED with the category include', async () => {
      prismaMock.blogPost.findFirst.mockResolvedValue(null);

      await repository.findPublishedBySlug('iphone16-vs-15');

      expect(prismaMock.blogPost.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'iphone16-vs-15', status: PublishStatus.PUBLISHED },
        }),
      );
    });
  });

  describe('publishDue', () => {
    it('flips due SCHEDULED posts to PUBLISHED and returns the count', async () => {
      prismaMock.blogPost.updateMany.mockResolvedValue({ count: 2 });
      const now = new Date('2026-07-05T00:00:00.000Z');

      const count = await repository.publishDue(now);

      expect(count).toBe(2);
      expect(prismaMock.blogPost.updateMany).toHaveBeenCalledWith({
        where: { status: PublishStatus.SCHEDULED, scheduledAt: { lte: now } },
        data: { status: PublishStatus.PUBLISHED, publishedAt: now, scheduledAt: null },
      });
    });
  });

  describe('deleteCategory guard helper', () => {
    it('countPostsInCategory counts posts referencing the category', async () => {
      prismaMock.blogPost.count.mockResolvedValue(4);

      const count = await repository.countPostsInCategory('cat-1');

      expect(count).toBe(4);
      expect(prismaMock.blogPost.count).toHaveBeenCalledWith({ where: { categoryId: 'cat-1' } });
    });
  });

  describe('revalidateTarget', () => {
    it('targets the blog collection tag + hub path', () => {
      expect(repository.revalidateTarget).toEqual({ tags: ['blog'], paths: ['/blog'] });
    });
  });

  // ─── categories: create + reorder (TASK-295) ────────────────────────────────

  describe('createCategory', () => {
    // Trap A: with the hand-typed `sortOrder` field gone from the admin form, the old
    // `?? 0` default would stack every new category ON TOP OF the first one.
    it('APPENDS a new category to the end of the list (max + 1), under the bucket lock', async () => {
      blogCategoryDelegate.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      blogCategoryDelegate.create.mockResolvedValue({ id: 'cat-1' });

      await repository.createCategory({ slug: 'guides', name: 'Гайди' });

      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(blogCategoryDelegate.create).toHaveBeenCalledWith({
        data: { slug: 'guides', name: 'Гайди', sortOrder: 3 },
      });
    });

    it('starts an EMPTY list at slot 0', async () => {
      blogCategoryDelegate.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      blogCategoryDelegate.create.mockResolvedValue({ id: 'cat-1' });

      await repository.createCategory({ slug: 'news', name: 'Новини' });

      expect(blogCategoryDelegate.create).toHaveBeenCalledWith({
        data: { slug: 'news', name: 'Новини', sortOrder: 0 },
      });
    });

    it('honours an EXPLICIT sortOrder without reading the list max', async () => {
      blogCategoryDelegate.create.mockResolvedValue({ id: 'cat-1' });

      await repository.createCategory({ slug: 'news', name: 'Новини', sortOrder: 7 });

      expect(blogCategoryDelegate.aggregate).not.toHaveBeenCalled();
      expect(blogCategoryDelegate.create).toHaveBeenCalledWith({
        data: { slug: 'news', name: 'Новини', sortOrder: 7 },
      });
    });
  });

  // TASK-357 — the ADMIN category read. The public `findAllCategories` is untouched: the
  // blog hub renders the complete filter strip and must never be paged.
  describe('findAllCategoriesAdmin', () => {
    it('returns the whole list and counts it in-process when page and limit are absent', async () => {
      blogCategoryDelegate.findMany.mockResolvedValue([{ id: 'cat-1' }]);

      const result = await repository.findAllCategoriesAdmin();

      expect(result).toEqual({ categories: [{ id: 'cat-1' }], total: 1 });
      expect(blogCategoryDelegate.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      expect(blogCategoryDelegate.count).not.toHaveBeenCalled();
    });

    it('matches the name case-insensitively when searching', async () => {
      blogCategoryDelegate.findMany.mockResolvedValue([]);

      await repository.findAllCategoriesAdmin({ search: 'ГаЙд' });

      expect(blogCategoryDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { name: { contains: 'ГаЙд', mode: 'insensitive' } } }),
      );
    });

    it('paginates and counts once either page or limit is present', async () => {
      blogCategoryDelegate.findMany.mockResolvedValue([{ id: 'cat-1' }]);
      blogCategoryDelegate.count.mockResolvedValue(14);

      const result = await repository.findAllCategoriesAdmin({ page: 2, limit: 5 });

      expect(result).toEqual({ categories: [{ id: 'cat-1' }], total: 14 });
      expect(blogCategoryDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });
  });

  describe('reorderCategories', () => {
    const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('locks the list, writes index → sortOrder and returns the refreshed list', async () => {
      // 1st findMany = the in-tx snapshot; 2nd = the refreshed list.
      blogCategoryDelegate.findMany
        .mockResolvedValueOnce([{ id: a }, { id: b }])
        .mockResolvedValueOnce([{ id: b }, { id: a }]);

      const result = await repository.reorderCategories([b, a]);

      expect(result).toEqual([{ id: b }, { id: a }]);
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(blogCategoryDelegate.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: b },
        data: { sortOrder: 0 },
      });
      expect(blogCategoryDelegate.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: a },
        data: { sortOrder: 1 },
      });
    });

    it('rejects an unknown id (NOT_FOUND) and writes nothing', async () => {
      blogCategoryDelegate.findMany.mockResolvedValueOnce([{ id: a }]);

      await expect(repository.reorderCategories([a, b])).rejects.toBeInstanceOf(
        ReorderNotFoundError,
      );

      expect(blogCategoryDelegate.updateMany).not.toHaveBeenCalled();
    });
  });
});
