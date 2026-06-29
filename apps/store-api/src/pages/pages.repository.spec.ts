import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma';
import { PageRepository } from './pages.repository';

const mockPage = {
  id: 'page-uuid-1',
  slug: 'privacy-policy',
  title: 'Privacy Policy',
  content: '<p>Hello</p>',
  excerpt: null,
  metaTitle: null,
  metaDescription: null,
  isActive: true,
  sortOrder: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const prismaMock = {
  page: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('PageRepository', () => {
  let repository: PageRepository;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PageRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    repository = module.get<PageRepository>(PageRepository);
  });

  describe('findAll', () => {
    it('returns only published pages with a total count', async () => {
      prismaMock.page.findMany.mockResolvedValue([mockPage]);
      prismaMock.page.count.mockResolvedValue(1);

      const result = await repository.findAll({ page: 1, limit: 20 });

      expect(result).toEqual({ pages: [mockPage], total: 1 });
      expect(prismaMock.page.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true }, skip: 0, take: 20 }),
      );
      expect(prismaMock.page.count).toHaveBeenCalledWith({ where: { isActive: true } });
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
    it('filters by slug and isActive = true', async () => {
      prismaMock.page.findFirst.mockResolvedValue(mockPage);

      const result = await repository.findBySlug('privacy-policy');

      expect(result).toBe(mockPage);
      expect(prismaMock.page.findFirst).toHaveBeenCalledWith({
        where: { slug: 'privacy-policy', isActive: true },
      });
    });
  });

  describe('findById', () => {
    it('looks up by id with no active filter', async () => {
      prismaMock.page.findUnique.mockResolvedValue(mockPage);

      const result = await repository.findById('page-uuid-1');

      expect(result).toBe(mockPage);
      expect(prismaMock.page.findUnique).toHaveBeenCalledWith({ where: { id: 'page-uuid-1' } });
    });
  });

  describe('findAllAdmin', () => {
    it('returns all pages when no isActive filter is given', async () => {
      prismaMock.page.findMany.mockResolvedValue([mockPage]);
      prismaMock.page.count.mockResolvedValue(1);

      const result = await repository.findAllAdmin({ page: 1, limit: 20 });

      expect(result).toEqual({ pages: [mockPage], total: 1 });
      expect(prismaMock.page.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });

    it('applies the isActive filter when provided', async () => {
      prismaMock.page.findMany.mockResolvedValue([]);
      prismaMock.page.count.mockResolvedValue(0);

      await repository.findAllAdmin({ page: 1, limit: 20, isActive: false });

      expect(prismaMock.page.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: false } }),
      );
    });
  });

  describe('create', () => {
    it('persists the page with defaults for omitted fields', async () => {
      prismaMock.page.create.mockResolvedValue(mockPage);

      await repository.create({
        slug: 'privacy-policy',
        title: 'Privacy Policy',
        content: '<p>Hello</p>',
      });

      expect(prismaMock.page.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: 'privacy-policy',
          title: 'Privacy Policy',
          content: '<p>Hello</p>',
          excerpt: null,
          metaTitle: null,
          metaDescription: null,
          isActive: false,
          sortOrder: 0,
        }),
      });
    });
  });

  describe('update', () => {
    it('forwards the partial data to prisma.update', async () => {
      prismaMock.page.update.mockResolvedValue(mockPage);

      await repository.update('page-uuid-1', { title: 'Renamed' });

      expect(prismaMock.page.update).toHaveBeenCalledWith({
        where: { id: 'page-uuid-1' },
        data: { title: 'Renamed' },
      });
    });
  });

  describe('publish / unpublish', () => {
    it('publish sets isActive = true', async () => {
      prismaMock.page.update.mockResolvedValue({ ...mockPage, isActive: true });

      await repository.publish('page-uuid-1');

      expect(prismaMock.page.update).toHaveBeenCalledWith({
        where: { id: 'page-uuid-1' },
        data: { isActive: true },
      });
    });

    it('unpublish sets isActive = false', async () => {
      prismaMock.page.update.mockResolvedValue({ ...mockPage, isActive: false });

      await repository.unpublish('page-uuid-1');

      expect(prismaMock.page.update).toHaveBeenCalledWith({
        where: { id: 'page-uuid-1' },
        data: { isActive: false },
      });
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
