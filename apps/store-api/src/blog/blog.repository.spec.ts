import { Test, TestingModule } from '@nestjs/testing';
import { PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { BlogRepository } from './blog.repository';

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
  blogCategory: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('BlogRepository', () => {
  let repository: BlogRepository;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [BlogRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    repository = module.get<BlogRepository>(BlogRepository);
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
});
