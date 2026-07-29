import { Test, TestingModule } from '@nestjs/testing';
import { PublishStatus, SlugRedirectEntity } from '@prisma/client';
import { PrismaService } from '../prisma';
import { SlugRedirectRepository } from '../slug-redirect';
import { PageRepository } from './pages.repository';

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

const txMock = {
  page: {
    update: jest.fn(),
  },
};

const prismaMock = {
  page: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
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
      expect(slugRedirectRepositoryMock.recordRename).toHaveBeenCalledWith(
        txMock,
        SlugRedirectEntity.PAGE,
        'privacy-policy',
        'new-slug',
      );
      expect(prismaMock.page.update).not.toHaveBeenCalled();
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
