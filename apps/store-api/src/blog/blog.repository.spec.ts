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
    create: jest.fn(),
    update: jest.fn(),
  },
  // TASK-554 — every write that names an author links the post to its Author row.
  author: {
    upsert: jest.fn(),
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
    updateManyAndReturn: jest.fn(),
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

  describe('author link (TASK-554)', () => {
    const AUTHOR_SELECT = { select: { id: true, name: true, role: true, bio: true } };

    const createInput = (authorName: string) => ({
      slug: 's',
      title: 't',
      excerpt: 'e',
      content: '<p>c</p>',
      categoryId: 'cat-1',
      authorName,
      status: PublishStatus.DRAFT,
      publishedAt: null,
      scheduledAt: null,
    });

    it('create upserts the author by trimmed name and links the post in one transaction', async () => {
      txMock.author.upsert.mockResolvedValue({ id: 'author-1' });
      txMock.blogPost.create.mockResolvedValue({ id: 'post-1' });

      await repository.create(createInput('  Ірина Ткач '));

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.author.upsert).toHaveBeenCalledWith({
        where: { name: 'Ірина Ткач' },
        update: {},
        create: { name: 'Ірина Ткач' },
        select: { id: true },
      });
      const args = txMock.blogPost.create.mock.calls[0][0];
      expect(args.data.authorId).toBe('author-1');
      expect(args.include.author).toEqual(AUTHOR_SELECT);
      expect(prismaMock.blogPost.create).not.toHaveBeenCalled();
    });

    it('create leaves the post unlinked when the author name is blank', async () => {
      txMock.blogPost.create.mockResolvedValue({ id: 'post-1' });

      await repository.create(createInput('   '));

      expect(txMock.author.upsert).not.toHaveBeenCalled();
      expect(txMock.blogPost.create.mock.calls[0][0].data.authorId).toBeNull();
    });

    it('update re-links the author inside a transaction when the name changes', async () => {
      txMock.author.upsert.mockResolvedValue({ id: 'author-2' });
      txMock.blogPost.update.mockResolvedValue({ id: 'post-1' });

      await repository.update('post-1', { authorName: 'Марія Литвин' });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.blogPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { authorName: 'Марія Литвин', authorId: 'author-2' },
        }),
      );
      expect(slugRedirectRepositoryMock.recordRename).not.toHaveBeenCalled();
      expect(prismaMock.blogPost.update).not.toHaveBeenCalled();
    });

    it('every post read carries the author summary', async () => {
      prismaMock.blogPost.findFirst.mockResolvedValue(null);
      prismaMock.blogPost.findMany.mockResolvedValue([]);
      prismaMock.blogPost.findUnique.mockResolvedValue(null);
      prismaMock.blogPost.count.mockResolvedValue(0);

      await repository.findPublishedBySlug('x');
      await repository.findAll({ page: 1, limit: 10, includeUnlisted: false });
      await repository.findAllAdmin({ page: 1, limit: 10 });
      await repository.findById('post-1');
      await repository.findPublishedByIds(['post-1'], false);

      expect(prismaMock.blogPost.findFirst.mock.calls[0][0].include.author).toEqual(AUTHOR_SELECT);
      expect(prismaMock.blogPost.findMany).toHaveBeenCalledTimes(3);
      for (const call of prismaMock.blogPost.findMany.mock.calls) {
        expect(call[0].include.author).toEqual(AUTHOR_SELECT);
      }
      expect(prismaMock.blogPost.findUnique.mock.calls[0][0].include.author).toEqual(AUTHOR_SELECT);
    });
  });

  describe('findAll (public)', () => {
    it('gates on PUBLISHED and computes skip from page/limit', async () => {
      prismaMock.blogPost.findMany.mockResolvedValue([]);
      prismaMock.blogPost.count.mockResolvedValue(0);

      await repository.findAll({ page: 2, limit: 9, includeUnlisted: false });

      expect(prismaMock.blogPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: PublishStatus.PUBLISHED, listed: true },
          skip: 9,
          take: 9,
        }),
      );
    });

    // TASK-436 — both halves of the `listed` invariant, in the one query that
    // serves both the /blog grid and sitemap.xml. If these ever agree with each
    // other, the feature is broken in one direction or the other.
    it('hides unlisted posts from a list read', async () => {
      prismaMock.blogPost.findMany.mockResolvedValue([]);
      prismaMock.blogPost.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 9, includeUnlisted: false });

      const where = prismaMock.blogPost.findMany.mock.calls[0][0].where;
      expect(where.listed).toBe(true);
    });

    it('keeps unlisted posts in a sitemap read — they are still indexable', async () => {
      prismaMock.blogPost.findMany.mockResolvedValue([]);
      prismaMock.blogPost.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 100, includeUnlisted: true });

      const where = prismaMock.blogPost.findMany.mock.calls[0][0].where;
      expect(where.status).toBe(PublishStatus.PUBLISHED);
      expect(where).not.toHaveProperty('listed');
    });

    // The SECOND path into the public list (TASK-417's search-index re-read)
    // needs the same gate: Meilisearch stores no `listed` field, so the flag can
    // only be enforced here.
    it('applies the same listing gate to the search-index re-read', async () => {
      prismaMock.blogPost.findMany.mockResolvedValue([]);

      await repository.findPublishedByIds(['post-1'], false);
      expect(prismaMock.blogPost.findMany.mock.calls[0][0].where.listed).toBe(true);

      await repository.findPublishedByIds(['post-1'], true);
      expect(prismaMock.blogPost.findMany.mock.calls[1][0].where).not.toHaveProperty('listed');
    });

    it('applies category and search filters', async () => {
      prismaMock.blogPost.findMany.mockResolvedValue([]);
      prismaMock.blogPost.count.mockResolvedValue(0);

      await repository.findAll({
        page: 1,
        limit: 9,
        category: 'guides',
        q: 'навушники',
        includeUnlisted: false,
      });

      const where = prismaMock.blogPost.findMany.mock.calls[0][0].where;
      expect(where.status).toBe(PublishStatus.PUBLISHED);
      expect(where.category).toEqual({ slug: 'guides' });
      expect(where.OR).toEqual([
        { title: { contains: 'навушники', mode: 'insensitive' } },
        { excerpt: { contains: 'навушники', mode: 'insensitive' } },
      ]);
    });
  });

  // TASK-543 — the header popup's reads select four columns and nothing else;
  // above all never `content`, and no category/author joins.
  describe('search-autocomplete suggestions', () => {
    const SELECT = { id: true, slug: true, title: true, coverImageUrl: true };

    it('re-reads engine hits PUBLISHED + listed, selecting only the popup columns', async () => {
      prismaMock.blogPost.findMany.mockResolvedValue([]);

      await repository.findPublishedSuggestionsByIds(['post-2', 'post-1']);

      expect(prismaMock.blogPost.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['post-2', 'post-1'] },
          status: PublishStatus.PUBLISHED,
          listed: true,
        },
        select: SELECT,
      });
    });

    it('skips the query entirely for an empty id list', async () => {
      await expect(repository.findPublishedSuggestionsByIds([])).resolves.toEqual([]);
      expect(prismaMock.blogPost.findMany).not.toHaveBeenCalled();
    });

    it('falls back to the title/excerpt scan with the list ordering and a take', async () => {
      prismaMock.blogPost.findMany.mockResolvedValue([]);

      await repository.findPublishedSuggestions('чохол', 5);

      expect(prismaMock.blogPost.findMany).toHaveBeenCalledWith({
        where: {
          status: PublishStatus.PUBLISHED,
          listed: true,
          OR: [
            { title: { contains: 'чохол', mode: 'insensitive' } },
            { excerpt: { contains: 'чохол', mode: 'insensitive' } },
          ],
        },
        select: SELECT,
        take: 5,
        orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      });
      // No count — a suggestion list has no pagination.
      expect(prismaMock.blogPost.count).not.toHaveBeenCalled();
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

  describe('publishDuePosts', () => {
    // TASK-525 — the scheduler has to index what it just published, so the flip
    // hands back WHICH posts went live, from the same statement that flipped
    // them: a separate read before or after could name a post an admin moved
    // back to draft in between.
    it('flips due SCHEDULED posts to PUBLISHED in one statement and returns their ids', async () => {
      prismaMock.blogPost.updateManyAndReturn.mockResolvedValue([{ id: 'p-1' }, { id: 'p-2' }]);
      const now = new Date('2026-07-05T00:00:00.000Z');

      const ids = await repository.publishDuePosts(now);

      expect(ids).toEqual(['p-1', 'p-2']);
      expect(prismaMock.blogPost.updateManyAndReturn).toHaveBeenCalledWith({
        where: { status: PublishStatus.SCHEDULED, scheduledAt: { lte: now } },
        data: { status: PublishStatus.PUBLISHED, publishedAt: now, scheduledAt: null },
        select: { id: true },
      });
      expect(prismaMock.blogPost.updateMany).not.toHaveBeenCalled();
    });

    it('returns an empty list when nothing is due', async () => {
      prismaMock.blogPost.updateManyAndReturn.mockResolvedValue([]);

      await expect(repository.publishDuePosts(new Date())).resolves.toEqual([]);
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
