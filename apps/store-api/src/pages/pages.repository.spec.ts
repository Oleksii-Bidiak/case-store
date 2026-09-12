import { Test, TestingModule } from '@nestjs/testing';
import { PublishStatus, SlugRedirectEntity } from '@prisma/client';
import { PrismaService } from '../prisma';
import { SlugRedirectRepository } from '../slug-redirect';
import { PageRepository } from './pages.repository';
import { ReorderStaleError } from '../common/reorder';

const mockPage = {
  id: 'page-uuid-1',
  slug: 'privacy-policy',
  title: 'Privacy Policy',
  content: '<p>Hello</p>',
  excerpt: null,
  metaTitle: null,
  metaDescription: null,
  status: PublishStatus.PUBLISHED,
  publishedAt: new Date('2026-01-01T00:00:00.000Z'),
  scheduledAt: null,
  isActive: true,
  sortOrder: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

/**
 * ONE page delegate shared by the singleton client and the transaction client: the
 * repository reads/writes through `tx.page` inside a transaction (create, reorder, a
 * slug-rename update) and through `this.prisma.page` outside one, and the assertions do
 * not care which.
 */
const pageDelegate = {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  count: jest.fn(),
  aggregate: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  delete: jest.fn(),
};

const txMock = {
  page: pageDelegate,
  // `pg_advisory_xact_lock` — taken by `create` and by `reorderAll`.
  $executeRaw: jest.fn(),
};

const prismaMock = {
  page: pageDelegate,
  $transaction: jest.fn((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
};

const slugRedirectRepositoryMock = {
  recordRename: jest.fn(),
};

describe('PageRepository', () => {
  let repository: PageRepository;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PageRepository,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SlugRedirectRepository, useValue: slugRedirectRepositoryMock },
      ],
    }).compile();

    repository = module.get<PageRepository>(PageRepository);
  });

  describe('findAll', () => {
    it('returns only PUBLISHED pages with a total count', async () => {
      prismaMock.page.findMany.mockResolvedValue([mockPage]);
      prismaMock.page.count.mockResolvedValue(1);

      const result = await repository.findAll({ page: 1, limit: 20 });

      expect(result).toEqual({ pages: [mockPage], total: 1 });
      expect(prismaMock.page.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: PublishStatus.PUBLISHED },
          skip: 0,
          take: 20,
        }),
      );
      expect(prismaMock.page.count).toHaveBeenCalledWith({
        where: { status: PublishStatus.PUBLISHED },
      });
    });

    it('computes skip from page/limit', async () => {
      prismaMock.page.findMany.mockResolvedValue([]);
      prismaMock.page.count.mockResolvedValue(0);

      await repository.findAll({ page: 3, limit: 10 });

      expect(prismaMock.page.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('findBySlug', () => {
    it('filters by slug and status = PUBLISHED', async () => {
      prismaMock.page.findFirst.mockResolvedValue(mockPage);

      const result = await repository.findBySlug('privacy-policy');

      expect(result).toBe(mockPage);
      expect(prismaMock.page.findFirst).toHaveBeenCalledWith({
        where: { slug: 'privacy-policy', status: PublishStatus.PUBLISHED },
      });
    });
  });

  describe('findById', () => {
    it('looks up by id with no status filter', async () => {
      prismaMock.page.findUnique.mockResolvedValue(mockPage);

      const result = await repository.findById('page-uuid-1');

      expect(result).toBe(mockPage);
      expect(prismaMock.page.findUnique).toHaveBeenCalledWith({ where: { id: 'page-uuid-1' } });
    });
  });

  describe('findAllAdmin', () => {
    it('returns all pages when no status filter is given', async () => {
      prismaMock.page.findMany.mockResolvedValue([mockPage]);
      prismaMock.page.count.mockResolvedValue(1);

      const result = await repository.findAllAdmin({ page: 1, limit: 20 });

      expect(result).toEqual({ pages: [mockPage], total: 1 });
      expect(prismaMock.page.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });

    it('applies the status filter when provided', async () => {
      prismaMock.page.findMany.mockResolvedValue([]);
      prismaMock.page.count.mockResolvedValue(0);

      await repository.findAllAdmin({ page: 1, limit: 20, status: PublishStatus.DRAFT });

      expect(prismaMock.page.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: PublishStatus.DRAFT } }),
      );
    });

    // TASK-357: an operator hunting for a legal page usually remembers its URL, not its
    // exact heading — so the search spans slug as well as title.
    it('searches title AND slug case-insensitively', async () => {
      prismaMock.page.findMany.mockResolvedValue([]);
      prismaMock.page.count.mockResolvedValue(0);

      await repository.findAllAdmin({ page: 1, limit: 20, search: 'ДоСтАв' });

      expect(prismaMock.page.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { title: { contains: 'ДоСтАв', mode: 'insensitive' } },
              { slug: { contains: 'ДоСтАв', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });
  });

  describe('create', () => {
    it('persists the page and derives isActive from status', async () => {
      prismaMock.page.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      prismaMock.page.create.mockResolvedValue(mockPage);

      await repository.create({
        slug: 'privacy-policy',
        title: 'Privacy Policy',
        content: '<p>Hello</p>',
        status: PublishStatus.PUBLISHED,
        publishedAt: mockPage.publishedAt,
        scheduledAt: null,
      });

      expect(prismaMock.page.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: 'privacy-policy',
          title: 'Privacy Policy',
          content: '<p>Hello</p>',
          status: PublishStatus.PUBLISHED,
          publishedAt: mockPage.publishedAt,
          scheduledAt: null,
          isActive: true,
          sortOrder: 0,
        }),
      });
    });

    it('sets isActive = false for a DRAFT create', async () => {
      prismaMock.page.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      prismaMock.page.create.mockResolvedValue(mockPage);

      await repository.create({
        slug: 'faq',
        title: 'FAQ',
        content: '<p>x</p>',
        status: PublishStatus.DRAFT,
        publishedAt: null,
        scheduledAt: null,
      });

      expect(prismaMock.page.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: PublishStatus.DRAFT, isActive: false }),
      });
    });

    // TASK-428: the whole point of the change — a new page lands at the END, not on
    // top of the first one.
    it('appends the page to the END of the list (max + 1) under the list lock', async () => {
      prismaMock.page.aggregate.mockResolvedValue({ _max: { sortOrder: 6 } });
      prismaMock.page.create.mockResolvedValue({ ...mockPage, sortOrder: 7 });

      await repository.create({
        slug: 'returns',
        title: 'Returns',
        content: '<p>x</p>',
        status: PublishStatus.DRAFT,
        publishedAt: null,
        scheduledAt: null,
      });

      // The max read MUST happen inside the locked transaction, or two concurrent
      // appends both read the same max and collide on one slot.
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prismaMock.page.aggregate).toHaveBeenCalledWith({ _max: { sortOrder: true } });
      expect(prismaMock.page.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 7 }),
      });
    });

    it('honours an explicit sortOrder without reading max', async () => {
      prismaMock.page.create.mockResolvedValue({ ...mockPage, sortOrder: 3 });

      await repository.create({
        slug: 'terms',
        title: 'Terms',
        content: '<p>x</p>',
        status: PublishStatus.DRAFT,
        publishedAt: null,
        scheduledAt: null,
        sortOrder: 3,
      });

      expect(prismaMock.page.aggregate).not.toHaveBeenCalled();
      expect(prismaMock.page.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 3 }),
      });
    });
  });

  // ─── reorderAll (TASK-428) ─────────────────────────────────────────────────

  describe('reorderAll', () => {
    const a = 'page-uuid-1';
    const b = 'page-uuid-2';

    it('locks the list, writes the index as sortOrder and returns the refreshed list', async () => {
      prismaMock.page.findMany
        // 1) the in-transaction snapshot of the list's membership
        .mockResolvedValueOnce([{ id: a }, { id: b }])
        // 2) the refreshed admin list, read inside the same transaction
        .mockResolvedValueOnce([
          { ...mockPage, id: b, sortOrder: 0 },
          { ...mockPage, sortOrder: 1 },
        ]);

      const result = await repository.reorderAll([b, a]);

      expect(result.total).toBe(2);
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prismaMock.page.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: b },
        data: { sortOrder: 0 },
      });
      expect(prismaMock.page.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: a },
        data: { sortOrder: 1 },
      });
    });

    it('rejects a PARTIAL ordering (a row appeared underneath the client) as stale', async () => {
      prismaMock.page.findMany.mockResolvedValueOnce([{ id: a }, { id: b }]);

      await expect(repository.reorderAll([a])).rejects.toBeInstanceOf(ReorderStaleError);
      expect(prismaMock.page.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('forwards partial data without touching status when omitted', async () => {
      prismaMock.page.update.mockResolvedValue(mockPage);

      await repository.update('page-uuid-1', { title: 'Renamed' });

      expect(prismaMock.page.update).toHaveBeenCalledWith({
        where: { id: 'page-uuid-1' },
        data: { title: 'Renamed' },
      });
    });

    it('writes the derived isActive mirror when status changes', async () => {
      prismaMock.page.update.mockResolvedValue(mockPage);

      await repository.update('page-uuid-1', {
        status: PublishStatus.PUBLISHED,
        publishedAt: mockPage.publishedAt,
      });

      expect(prismaMock.page.update).toHaveBeenCalledWith({
        where: { id: 'page-uuid-1' },
        data: expect.objectContaining({
          status: PublishStatus.PUBLISHED,
          publishedAt: mockPage.publishedAt,
          isActive: true,
        }),
      });
    });

    it('never opens a transaction nor records a redirect when slugRename is absent', async () => {
      prismaMock.page.update.mockResolvedValue(mockPage);

      await repository.update('page-uuid-1', { title: 'Renamed' });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(slugRedirectRepositoryMock.recordRename).not.toHaveBeenCalled();
    });

    it('runs the page update + recordRename inside one transaction when slugRename is given', async () => {
      const renamed = { ...mockPage, slug: 'new-slug' };
      txMock.page.update.mockResolvedValue(renamed);

      const result = await repository.update(
        'page-uuid-1',
        { slug: 'new-slug' },
        { oldSlug: 'privacy-policy', newSlug: 'new-slug' },
      );

      expect(result).toBe(renamed);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.page.update).toHaveBeenCalledWith({
        where: { id: 'page-uuid-1' },
        data: { slug: 'new-slug' },
      });
      // The ledger write receives the SAME transaction client the update ran on — which
      // is what makes the rename and the redirect atomic. (It is no longer provable by
      // asserting the singleton delegate went untouched: since TASK-428 the singleton and
      // the transaction client share ONE delegate mock, because `create` and `reorderAll`
      // write through `tx.page` too.)
      expect(slugRedirectRepositoryMock.recordRename).toHaveBeenCalledWith(
        txMock,
        SlugRedirectEntity.PAGE,
        'privacy-policy',
        'new-slug',
      );
      expect(prismaMock.page.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('publish / unpublish', () => {
    it('publish sets status PUBLISHED, stamps publishedAt, clears scheduledAt, isActive true', async () => {
      prismaMock.page.update.mockResolvedValue(mockPage);
      const now = new Date('2026-07-05T00:00:00.000Z');

      await repository.publish('page-uuid-1', now);

      expect(prismaMock.page.update).toHaveBeenCalledWith({
        where: { id: 'page-uuid-1' },
        data: {
          status: PublishStatus.PUBLISHED,
          publishedAt: now,
          scheduledAt: null,
          isActive: true,
        },
      });
    });

    it('unpublish sets status DRAFT, clears timestamps, isActive false', async () => {
      prismaMock.page.update.mockResolvedValue({ ...mockPage, status: PublishStatus.DRAFT });

      await repository.unpublish('page-uuid-1');

      expect(prismaMock.page.update).toHaveBeenCalledWith({
        where: { id: 'page-uuid-1' },
        data: {
          status: PublishStatus.DRAFT,
          publishedAt: null,
          scheduledAt: null,
          isActive: false,
        },
      });
    });
  });

  describe('publishDue', () => {
    it('flips due SCHEDULED rows to PUBLISHED and returns the count', async () => {
      prismaMock.page.updateMany.mockResolvedValue({ count: 3 });
      const now = new Date('2026-07-05T12:00:00.000Z');

      const count = await repository.publishDue(now);

      expect(count).toBe(3);
      expect(prismaMock.page.updateMany).toHaveBeenCalledWith({
        where: { status: PublishStatus.SCHEDULED, scheduledAt: { lte: now } },
        data: {
          status: PublishStatus.PUBLISHED,
          publishedAt: now,
          scheduledAt: null,
          isActive: true,
        },
      });
    });
  });

  describe('revalidateTarget', () => {
    it('exposes the pages cache target for the scheduler', () => {
      expect(repository.revalidateTarget).toEqual({ tags: ['pages'], paths: ['/legal'] });
    });
  });

  describe('delete', () => {
    it('hard-deletes by id', async () => {
      prismaMock.page.delete.mockResolvedValue(mockPage);

      await repository.delete('page-uuid-1');

      expect(prismaMock.page.delete).toHaveBeenCalledWith({ where: { id: 'page-uuid-1' } });
    });
  });
});
