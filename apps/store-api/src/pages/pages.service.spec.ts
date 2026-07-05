import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageRepository } from './pages.repository';
import { PageService } from './pages.service';
import { PageEntity } from './entities';

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

const draftPage = { ...mockPage, id: 'page-uuid-2', slug: 'faq', title: 'FAQ', isActive: false };

const pageRepositoryMock = {
  findAll: jest.fn(),
  findBySlug: jest.fn(),
  findById: jest.fn(),
  findBySlugAny: jest.fn(),
  findAllAdmin: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  publish: jest.fn(),
  unpublish: jest.fn(),
  delete: jest.fn(),
};

describe('PageService', () => {
  let service: PageService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PageService, { provide: PageRepository, useValue: pageRepositoryMock }],
    }).compile();

    service = module.get<PageService>(PageService);
  });

  describe('findAll', () => {
    it('returns published pages with pagination meta', async () => {
      pageRepositoryMock.findAll.mockResolvedValue({ pages: [mockPage], total: 1 });

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toBeInstanceOf(PageEntity);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });
  });

  describe('findPublishedBySlug', () => {
    it('returns the page when published', async () => {
      pageRepositoryMock.findBySlug.mockResolvedValue(mockPage);

      const result = await service.findPublishedBySlug('privacy-policy');

      expect(result).toBeInstanceOf(PageEntity);
      expect(result.slug).toBe('privacy-policy');
    });

    it('throws NotFoundException when missing or unpublished', async () => {
      pageRepositoryMock.findBySlug.mockResolvedValue(null);

      await expect(service.findPublishedBySlug('faq')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllAdmin', () => {
    it('forwards the isActive filter and returns drafts + published', async () => {
      pageRepositoryMock.findAllAdmin.mockResolvedValue({ pages: [mockPage, draftPage], total: 2 });

      const result = await service.findAllAdmin({ page: 1, limit: 20, isActive: undefined });

      expect(result.data).toHaveLength(2);
      expect(pageRepositoryMock.findAllAdmin).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        isActive: undefined,
      });
    });
  });

  describe('findByIdAdmin', () => {
    it('returns the page when found', async () => {
      pageRepositoryMock.findById.mockResolvedValue(draftPage);

      const result = await service.findByIdAdmin('page-uuid-2');

      expect(result).toBeInstanceOf(PageEntity);
    });

    it('throws NotFoundException when not found', async () => {
      pageRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.findByIdAdmin('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('auto-generates the slug from the title when omitted', async () => {
      pageRepositoryMock.findBySlugAny.mockResolvedValue(null);
      pageRepositoryMock.create.mockResolvedValue(mockPage);

      await service.create({ title: 'Privacy Policy', content: '<p>Hello</p>' });

      expect(pageRepositoryMock.findBySlugAny).toHaveBeenCalledWith('privacy-policy');
      expect(pageRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'privacy-policy', title: 'Privacy Policy' }),
      );
    });

    it('sanitizes the content HTML before persisting', async () => {
      pageRepositoryMock.findBySlugAny.mockResolvedValue(null);
      pageRepositoryMock.create.mockResolvedValue(mockPage);

      await service.create({
        title: 'Privacy Policy',
        content: '<p>ok</p><script>alert(1)</script>',
      });

      const passed = pageRepositoryMock.create.mock.calls[0][0] as { content: string };
      expect(passed.content).toContain('<p>ok</p>');
      expect(passed.content).not.toContain('script');
      expect(passed.content).not.toContain('alert(1)');
    });

    it('throws ConflictException when the slug already exists', async () => {
      pageRepositoryMock.findBySlugAny.mockResolvedValue(mockPage);

      await expect(
        service.create({ title: 'Privacy Policy', content: '<p>x</p>' }),
      ).rejects.toThrow(ConflictException);
      expect(pageRepositoryMock.create).not.toHaveBeenCalled();
    });

    it('translates a Prisma P2002 race into ConflictException', async () => {
      pageRepositoryMock.findBySlugAny.mockResolvedValue(null);
      pageRepositoryMock.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '7.0.0',
        }),
      );

      await expect(
        service.create({ title: 'Privacy Policy', content: '<p>x</p>' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the page is missing', async () => {
      pageRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.update('missing', { title: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('rejects changing the slug to one already taken by another page', async () => {
      pageRepositoryMock.findById.mockResolvedValue(mockPage);
      pageRepositoryMock.findBySlugAny.mockResolvedValue({ ...mockPage, id: 'other' });

      await expect(service.update('page-uuid-1', { slug: 'faq' })).rejects.toThrow(
        ConflictException,
      );
      expect(pageRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('updates when the slug is unchanged', async () => {
      pageRepositoryMock.findById.mockResolvedValue(mockPage);
      pageRepositoryMock.update.mockResolvedValue({ ...mockPage, title: 'Renamed' });

      const result = await service.update('page-uuid-1', { title: 'Renamed' });

      expect(result.title).toBe('Renamed');
      expect(pageRepositoryMock.findBySlugAny).not.toHaveBeenCalled();
    });

    it('sanitizes content on update when content is provided', async () => {
      pageRepositoryMock.findById.mockResolvedValue(mockPage);
      pageRepositoryMock.update.mockResolvedValue(mockPage);

      await service.update('page-uuid-1', {
        content: '<p>keep</p><img src="x" onerror="alert(1)" />',
      });

      const passed = pageRepositoryMock.update.mock.calls[0][1] as { content: string };
      expect(passed.content).toContain('<p>keep</p>');
      expect(passed.content).not.toContain('onerror');
    });

    it('leaves content undefined when not provided (no blanking)', async () => {
      pageRepositoryMock.findById.mockResolvedValue(mockPage);
      pageRepositoryMock.update.mockResolvedValue(mockPage);

      await service.update('page-uuid-1', { title: 'Renamed' });

      const passed = pageRepositoryMock.update.mock.calls[0][1] as { content?: string };
      expect(passed.content).toBeUndefined();
    });
  });

  describe('publish / unpublish', () => {
    it('publish throws NotFoundException when missing', async () => {
      pageRepositoryMock.findById.mockResolvedValue(null);
      await expect(service.publish('missing')).rejects.toThrow(NotFoundException);
    });

    it('publish sets the page active', async () => {
      pageRepositoryMock.findById.mockResolvedValue(draftPage);
      pageRepositoryMock.publish.mockResolvedValue({ ...draftPage, isActive: true });

      const result = await service.publish('page-uuid-2');

      expect(result.isActive).toBe(true);
    });

    it('unpublish sets the page inactive', async () => {
      pageRepositoryMock.findById.mockResolvedValue(mockPage);
      pageRepositoryMock.unpublish.mockResolvedValue({ ...mockPage, isActive: false });

      const result = await service.unpublish('page-uuid-1');

      expect(result.isActive).toBe(false);
    });
  });

  describe('delete', () => {
    it('throws NotFoundException when missing', async () => {
      pageRepositoryMock.findById.mockResolvedValue(null);
      await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
    });

    it('hard-deletes an existing page', async () => {
      pageRepositoryMock.findById.mockResolvedValue(mockPage);
      pageRepositoryMock.delete.mockResolvedValue(mockPage);

      await service.delete('page-uuid-1');

      expect(pageRepositoryMock.delete).toHaveBeenCalledWith('page-uuid-1');
    });
  });
});
