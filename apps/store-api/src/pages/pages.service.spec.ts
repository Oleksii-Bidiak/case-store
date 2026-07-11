import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma, PublishStatus } from '@prisma/client';
import { PageRepository } from './pages.repository';
import { PageService } from './pages.service';
import { PageEntity } from './entities';
import { RevalidationNotifier } from '../publishing';

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

const draftPage = {
  ...mockPage,
  id: 'page-uuid-2',
  slug: 'faq',
  title: 'FAQ',
  status: PublishStatus.DRAFT,
  publishedAt: null,
  isActive: false,
};

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

const revalidationMock = { revalidate: jest.fn() };

describe('PageService', () => {
  let service: PageService;

  beforeEach(async () => {
    jest.clearAllMocks();
    revalidationMock.revalidate.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PageService,
        { provide: PageRepository, useValue: pageRepositoryMock },
        { provide: RevalidationNotifier, useValue: revalidationMock },
      ],
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
    it('forwards the status filter and returns drafts + published', async () => {
      pageRepositoryMock.findAllAdmin.mockResolvedValue({ pages: [mockPage, draftPage], total: 2 });

      const result = await service.findAllAdmin({ page: 1, limit: 20, status: undefined });

      expect(result.data).toHaveLength(2);
      expect(pageRepositoryMock.findAllAdmin).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        status: undefined,
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

    it('defaults to DRAFT (no publish, no revalidation) when status is omitted', async () => {
      pageRepositoryMock.findBySlugAny.mockResolvedValue(null);
      pageRepositoryMock.create.mockResolvedValue(draftPage);

      await service.create({ title: 'FAQ', content: '<p>x</p>' });

      const passed = pageRepositoryMock.create.mock.calls[0][0] as {
        status: PublishStatus;
        publishedAt: Date | null;
      };
      expect(passed.status).toBe(PublishStatus.DRAFT);
      expect(passed.publishedAt).toBeNull();
      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });

    it('stamps publishedAt and revalidates when created PUBLISHED', async () => {
      pageRepositoryMock.findBySlugAny.mockResolvedValue(null);
      pageRepositoryMock.create.mockResolvedValue(mockPage);

      await service.create({
        title: 'Privacy Policy',
        content: '<p>x</p>',
        status: PublishStatus.PUBLISHED,
      });

      const passed = pageRepositoryMock.create.mock.calls[0][0] as {
        status: PublishStatus;
        publishedAt: Date | null;
      };
      expect(passed.status).toBe(PublishStatus.PUBLISHED);
      expect(passed.publishedAt).toBeInstanceOf(Date);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['pages', 'page:privacy-policy'] }),
      );
    });

    it('keeps a future SCHEDULED page unpublished with scheduledAt set', async () => {
      pageRepositoryMock.findBySlugAny.mockResolvedValue(null);
      pageRepositoryMock.create.mockResolvedValue(draftPage);
      const future = new Date(Date.now() + 86_400_000).toISOString();

      await service.create({
        title: 'FAQ',
        content: '<p>x</p>',
        status: PublishStatus.SCHEDULED,
        scheduledAt: future,
      });

      const passed = pageRepositoryMock.create.mock.calls[0][0] as {
        status: PublishStatus;
        publishedAt: Date | null;
        scheduledAt: Date | null;
      };
      expect(passed.status).toBe(PublishStatus.SCHEDULED);
      expect(passed.publishedAt).toBeNull();
      expect(passed.scheduledAt).toBeInstanceOf(Date);
      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
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

    it('does not touch publish fields when status is omitted', async () => {
      pageRepositoryMock.findById.mockResolvedValue(mockPage);
      pageRepositoryMock.update.mockResolvedValue(mockPage);

      await service.update('page-uuid-1', { title: 'Renamed' });

      const passed = pageRepositoryMock.update.mock.calls[0][1] as {
        status?: PublishStatus;
        publishedAt?: Date | null;
      };
      expect(passed.status).toBeUndefined();
      expect(passed.publishedAt).toBeUndefined();
    });

    it('preserves the original publishedAt when re-saving an already-PUBLISHED page', async () => {
      pageRepositoryMock.findById.mockResolvedValue(mockPage); // already PUBLISHED
      pageRepositoryMock.update.mockResolvedValue(mockPage);

      await service.update('page-uuid-1', { status: PublishStatus.PUBLISHED });

      const passed = pageRepositoryMock.update.mock.calls[0][1] as {
        status?: PublishStatus;
        publishedAt?: Date | null;
      };
      expect(passed.status).toBe(PublishStatus.PUBLISHED);
      expect(passed.publishedAt).toEqual(mockPage.publishedAt);
    });

    it('records a slug redirect when renaming a PUBLISHED page', async () => {
      pageRepositoryMock.findById.mockResolvedValue(mockPage); // PUBLISHED
      pageRepositoryMock.findBySlugAny.mockResolvedValue(null);
      pageRepositoryMock.update.mockResolvedValue({ ...mockPage, slug: 'new-slug' });

      await service.update('page-uuid-1', { slug: 'new-slug' });

      expect(pageRepositoryMock.update).toHaveBeenCalledWith(
        'page-uuid-1',
        expect.objectContaining({ slug: 'new-slug' }),
        { oldSlug: 'privacy-policy', newSlug: 'new-slug' },
      );
    });

    it('purges BOTH old and new slug cache targets when a published page is renamed', async () => {
      pageRepositoryMock.findById.mockResolvedValue(mockPage); // PUBLISHED
      pageRepositoryMock.findBySlugAny.mockResolvedValue(null);
      pageRepositoryMock.update.mockResolvedValue({ ...mockPage, slug: 'new-slug' });

      await service.update('page-uuid-1', { slug: 'new-slug' });

      expect(revalidationMock.revalidate).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining(['pages', 'page:privacy-policy', 'page:new-slug']),
          paths: expect.arrayContaining(['/legal', '/legal/privacy-policy', '/legal/new-slug']),
        }),
      );
    });

    it('does NOT record a redirect when renaming a DRAFT page', async () => {
      pageRepositoryMock.findById.mockResolvedValue(draftPage); // DRAFT
      pageRepositoryMock.findBySlugAny.mockResolvedValue(null);
      pageRepositoryMock.update.mockResolvedValue({ ...draftPage, slug: 'new-slug' });

      await service.update('page-uuid-2', { slug: 'new-slug' });

      expect(pageRepositoryMock.update).toHaveBeenCalledWith(
        'page-uuid-2',
        expect.objectContaining({ slug: 'new-slug' }),
        undefined,
      );
    });

    it('does NOT record a redirect when updating a published page without changing the slug', async () => {
      pageRepositoryMock.findById.mockResolvedValue(mockPage); // PUBLISHED
      pageRepositoryMock.update.mockResolvedValue({ ...mockPage, title: 'Renamed' });

      await service.update('page-uuid-1', { title: 'Renamed' });

      expect(pageRepositoryMock.update).toHaveBeenCalledWith(
        'page-uuid-1',
        expect.objectContaining({ title: 'Renamed' }),
        undefined,
      );
    });

    it('does NOT record a redirect when the submitted slug equals the current one', async () => {
      pageRepositoryMock.findById.mockResolvedValue(mockPage); // PUBLISHED
      pageRepositoryMock.update.mockResolvedValue(mockPage);

      await service.update('page-uuid-1', { slug: 'privacy-policy' });

      expect(pageRepositoryMock.update).toHaveBeenCalledWith(
        'page-uuid-1',
        expect.objectContaining({ slug: 'privacy-policy' }),
        undefined,
      );
    });
  });

  describe('publish / unpublish', () => {
    it('publish throws NotFoundException when missing', async () => {
      pageRepositoryMock.findById.mockResolvedValue(null);
      await expect(service.publish('missing')).rejects.toThrow(NotFoundException);
    });

    it('publish sets the page PUBLISHED and revalidates the storefront', async () => {
      pageRepositoryMock.findById.mockResolvedValue(draftPage);
      pageRepositoryMock.publish.mockResolvedValue({
        ...draftPage,
        status: PublishStatus.PUBLISHED,
        isActive: true,
      });

      const result = await service.publish('page-uuid-2');

      expect(result.status).toBe(PublishStatus.PUBLISHED);
      expect(result.isActive).toBe(true);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['pages', 'page:faq'] }),
      );
    });

    it('unpublish sets the page DRAFT and revalidates the storefront', async () => {
      pageRepositoryMock.findById.mockResolvedValue(mockPage);
      pageRepositoryMock.unpublish.mockResolvedValue({
        ...mockPage,
        status: PublishStatus.DRAFT,
        isActive: false,
      });

      const result = await service.unpublish('page-uuid-1');

      expect(result.status).toBe(PublishStatus.DRAFT);
      expect(result.isActive).toBe(false);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['pages', 'page:privacy-policy'] }),
      );
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
