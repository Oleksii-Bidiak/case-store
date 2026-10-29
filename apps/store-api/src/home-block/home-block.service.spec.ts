import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Carousel, CarouselSource, HomeBlockType, PublishStatus } from '@prisma/client';
import { CarouselService, PublicCarouselEntity } from '../carousels';
import type { PublicProductEntity } from '../product';
import { RevalidationNotifier } from '../publishing';
import { ReorderStaleError } from '../common/reorder';
import { HomeBlockRecord, HomeBlockRepository } from './home-block.repository';
import { HomeBlockService } from './home-block.service';
import type { UpdateHomeBlockDto } from './dto';

const at = new Date('2026-10-01T00:00:00.000Z');

const carousel = (id: string, status: PublishStatus = PublishStatus.PUBLISHED): Carousel => ({
  id,
  title: `title-${id}`,
  source: CarouselSource.NEWEST,
  categoryId: null,
  itemLimit: 12,
  sortOrder: 0,
  status,
  publishedAt: null,
  scheduledAt: null,
  createdAt: at,
  updatedAt: at,
});

const record = (overrides: Partial<HomeBlockRecord>): HomeBlockRecord => ({
  id: 'block',
  type: HomeBlockType.HERO,
  title: null,
  sortOrder: 0,
  status: PublishStatus.PUBLISHED,
  publishedAt: at,
  scheduledAt: null,
  carouselId: null,
  carousel: null,
  tabs: [],
  createdAt: at,
  updatedAt: at,
  ...overrides,
});

const target = { tags: ['home-blocks', 'carousels'], paths: ['/'] };

describe('HomeBlockService', () => {
  const repository = {
    findForPage: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    publish: jest.fn(),
    unpublish: jest.fn(),
    delete: jest.fn(),
    reorder: jest.fn(),
    revalidateTarget: target,
  };
  const carouselService = { resolvePublic: jest.fn(), findByIds: jest.fn() };
  const revalidation = { revalidate: jest.fn() };
  const emptyIds = new Set<string>();
  let service: HomeBlockService;

  beforeEach(() => {
    jest.resetAllMocks();
    revalidation.revalidate.mockResolvedValue(undefined);
    // By default every carousel resolves to one product; `emptyIds` resolve to none.
    carouselService.resolvePublic.mockImplementation((rows: Carousel[]) =>
      Promise.resolve(
        rows.map((row) =>
          PublicCarouselEntity.fromEntity(
            row,
            emptyIds.has(row.id) ? [] : [{ id: `product-of-${row.id}` } as PublicProductEntity],
          ),
        ),
      ),
    );
    emptyIds.clear();
    repository.delete.mockResolvedValue(true);
    service = new HomeBlockService(
      repository as unknown as HomeBlockRepository,
      carouselService as unknown as CarouselService,
      revalidation as unknown as RevalidationNotifier,
    );
  });

  describe('findPublic', () => {
    it('reads PUBLISHED blocks only and resolves every visible carousel ONCE, in one call', async () => {
      const shared = carousel('shared');
      repository.findForPage.mockResolvedValue([
        record({ id: 'hero', type: HomeBlockType.HERO }),
        record({
          id: 'tabs',
          type: HomeBlockType.TABS,
          title: 'Популярне',
          tabs: [
            { carouselId: 'shared', sortOrder: 0, carousel: shared },
            { carouselId: 'draft', sortOrder: 1, carousel: carousel('draft', PublishStatus.DRAFT) },
          ],
        }),
        record({
          id: 'rail',
          type: HomeBlockType.CAROUSEL,
          carouselId: 'shared',
          carousel: shared,
        }),
        record({
          id: 'hidden-rail',
          type: HomeBlockType.CAROUSEL,
          carouselId: 'd',
          carousel: carousel('d', PublishStatus.DRAFT),
        }),
      ]);

      const result = await service.findPublic();

      expect(repository.findForPage).toHaveBeenCalledWith({ includeUnpublished: false });
      expect(carouselService.resolvePublic).toHaveBeenCalledTimes(1);
      expect(carouselService.resolvePublic.mock.calls[0][0].map((c: Carousel) => c.id)).toEqual([
        'shared',
      ]);
      expect(result.map((block) => block.id)).toEqual(['hero', 'tabs', 'rail']);
      expect(result[0]).toMatchObject({ title: null, carousel: null, tabs: [] });
      expect(result[1].title).toBe('Популярне');
      expect(result[1].tabs.map((tab) => tab.id)).toEqual(['shared']);
      expect(result[2].carousel?.id).toBe('shared');
    });

    it('in a preview includes unpublished blocks and draft carousels', async () => {
      repository.findForPage.mockResolvedValue([
        record({
          id: 'draft-rail',
          type: HomeBlockType.CAROUSEL,
          status: PublishStatus.DRAFT,
          carouselId: 'd',
          carousel: carousel('d', PublishStatus.DRAFT),
        }),
      ]);

      const result = await service.findPublic({ preview: true });

      expect(repository.findForPage).toHaveBeenCalledWith({ includeUnpublished: true });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ status: PublishStatus.DRAFT, carousel: { id: 'd' } });
    });
  });

  describe('findAllAdmin', () => {
    it('flags system, orphaned and empty blocks', async () => {
      repository.findAll.mockResolvedValue([
        record({ id: 'hero', type: HomeBlockType.HERO }),
        record({ id: 'orphan', type: HomeBlockType.CAROUSEL, carousel: null }),
        record({
          id: 'empty-tabs',
          type: HomeBlockType.TABS,
          title: 'X',
          tabs: [{ carouselId: 'd', sortOrder: 0, carousel: carousel('d', PublishStatus.DRAFT) }],
        }),
        record({
          id: 'ok',
          type: HomeBlockType.CAROUSEL,
          carouselId: 'p',
          carousel: carousel('p'),
        }),
      ]);

      const [hero, orphan, emptyTabs, ok] = await service.findAllAdmin();

      expect(hero).toMatchObject({ isSystem: true, isOrphaned: false, isEmpty: false });
      expect(orphan).toMatchObject({ isSystem: false, isOrphaned: true, isEmpty: true });
      expect(emptyTabs).toMatchObject({ isEmpty: true, tabs: [{ carousel: { id: 'd' } }] });
      expect(ok).toMatchObject({ isOrphaned: false, isEmpty: false, carousel: { id: 'p' } });
    });

    // W2: «shows nothing» means nothing on the storefront, not just "unpublished".
    it('flags a published carousel that resolves to 0 products, and a TABS block whose published tabs are all empty', async () => {
      emptyIds.add('sale');
      emptyIds.add('empty-tab');
      repository.findAll.mockResolvedValue([
        record({
          id: 'empty-rail',
          type: HomeBlockType.CAROUSEL,
          carouselId: 'sale',
          carousel: carousel('sale'),
        }),
        record({
          id: 'empty-tabs',
          type: HomeBlockType.TABS,
          title: 'X',
          tabs: [
            { carouselId: 'empty-tab', sortOrder: 0, carousel: carousel('empty-tab') },
            { carouselId: 'd', sortOrder: 1, carousel: carousel('d', PublishStatus.DRAFT) },
          ],
        }),
        record({
          id: 'one-good-tab',
          type: HomeBlockType.TABS,
          title: 'Y',
          tabs: [
            { carouselId: 'empty-tab', sortOrder: 0, carousel: carousel('empty-tab') },
            { carouselId: 'full', sortOrder: 1, carousel: carousel('full') },
          ],
        }),
        record({ id: 'no-tabs', type: HomeBlockType.TABS, title: 'Z', tabs: [] }),
        record({
          id: 'draft-rail',
          type: HomeBlockType.CAROUSEL,
          carouselId: 'd',
          carousel: carousel('d', PublishStatus.DRAFT),
        }),
      ]);

      const result = await service.findAllAdmin();

      expect(result.map((block) => [block.id, block.isEmpty, block.isOrphaned])).toEqual([
        ['empty-rail', true, false],
        ['empty-tabs', true, false],
        ['one-good-tab', false, false],
        ['no-tabs', true, false],
        ['draft-rail', true, false],
      ]);
      // Each PUBLISHED carousel resolved once, in ONE call; drafts never resolved.
      expect(carouselService.resolvePublic).toHaveBeenCalledTimes(1);
      expect(carouselService.resolvePublic.mock.calls[0][0].map((row: Carousel) => row.id)).toEqual(
        ['sale', 'empty-tab', 'full'],
      );
    });

    it('does not resolve anything when no block points at a published carousel', async () => {
      repository.findAll.mockResolvedValue([record({ id: 'hero', type: HomeBlockType.HERO })]);

      await service.findAllAdmin();

      expect(carouselService.resolvePublic).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('creates a CAROUSEL block after checking the carousel exists, and revalidates when live', async () => {
      carouselService.findByIds.mockResolvedValue([{ id: 'c1' }]);
      repository.create.mockResolvedValue(
        record({ type: HomeBlockType.CAROUSEL, carouselId: 'c1', carousel: carousel('c1') }),
      );

      await service.create({
        type: HomeBlockType.CAROUSEL,
        carouselId: 'c1',
        status: PublishStatus.PUBLISHED,
        position: 4,
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: HomeBlockType.CAROUSEL,
          carouselId: 'c1',
          title: null,
          tabCarouselIds: [],
          position: 4,
          status: PublishStatus.PUBLISHED,
        }),
      );
      expect(revalidation.revalidate).toHaveBeenCalledWith(target);
    });

    it('creates a TABS block as a DRAFT by default without revalidating', async () => {
      carouselService.findByIds.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      repository.create.mockResolvedValue(
        record({ type: HomeBlockType.TABS, status: PublishStatus.DRAFT, title: 'X' }),
      );

      await service.create({ type: HomeBlockType.TABS, title: 'X', tabs: ['a', 'b'] });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          carouselId: null,
          title: 'X',
          tabCarouselIds: ['a', 'b'],
          status: PublishStatus.DRAFT,
        }),
      );
      expect(revalidation.revalidate).not.toHaveBeenCalled();
    });

    it('404s on a carousel that does not exist, before writing', async () => {
      carouselService.findByIds.mockResolvedValue([]);

      await expect(
        service.create({ type: HomeBlockType.CAROUSEL, carouselId: 'missing' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('rejects a field that does not belong to the stored type', async () => {
      repository.findById.mockResolvedValue(record({ type: HomeBlockType.HERO }));

      await expect(service.update('block', { title: 'X' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.update('block', { carouselId: 'c' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('replaces the tabs of a TABS block and keeps the original publishedAt on re-publish', async () => {
      const block = record({ type: HomeBlockType.TABS, title: 'X' });
      repository.findById.mockResolvedValue(block);
      carouselService.findByIds.mockResolvedValue([{ id: 'b' }, { id: 'a' }]);
      repository.update.mockResolvedValue(block);

      await service.update('block', { tabs: ['b', 'a'], status: PublishStatus.PUBLISHED });

      expect(repository.update).toHaveBeenCalledWith(
        'block',
        expect.objectContaining({
          tabCarouselIds: ['b', 'a'],
          status: PublishStatus.PUBLISHED,
          publishedAt: at,
        }),
      );
      expect(revalidation.revalidate).toHaveBeenCalledWith(target);
    });

    it('404s for a missing block', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.update('missing', {})).rejects.toBeInstanceOf(NotFoundException);
    });

    // W1 defence in depth: a null that slipped past the DTO means "leave as is".
    it('never forwards null as a value to write', async () => {
      const block = record({ type: HomeBlockType.TABS, title: 'X' });
      repository.findById.mockResolvedValue(block);
      repository.update.mockResolvedValue(block);

      await service.update('block', {
        title: null,
        tabs: null,
        status: null,
      } as unknown as UpdateHomeBlockDto);

      expect(repository.update).toHaveBeenCalledWith('block', {
        title: undefined,
        carouselId: undefined,
        tabCarouselIds: undefined,
      });
    });
  });

  describe('delete', () => {
    it('refuses to delete a singleton block with HOME_BLOCK_SYSTEM', async () => {
      repository.findById.mockResolvedValue(record({ type: HomeBlockType.NEWSLETTER }));

      await expect(service.delete('block')).rejects.toMatchObject({
        status: 409,
        response: { error: 'HOME_BLOCK_SYSTEM' },
      });
      await expect(service.delete('block')).rejects.toBeInstanceOf(ConflictException);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('404s when the block vanished between the read and the delete', async () => {
      repository.findById.mockResolvedValue(record({ type: HomeBlockType.CAROUSEL }));
      repository.delete.mockResolvedValue(false);

      await expect(service.delete('block')).rejects.toBeInstanceOf(NotFoundException);
      expect(revalidation.revalidate).not.toHaveBeenCalled();
    });

    it('deletes a CAROUSEL block and revalidates when it was live', async () => {
      repository.findById.mockResolvedValue(record({ type: HomeBlockType.CAROUSEL }));

      await service.delete('block');

      expect(repository.delete).toHaveBeenCalledWith('block');
      expect(revalidation.revalidate).toHaveBeenCalledWith(target);
    });
  });

  describe('publish / unpublish / reorder', () => {
    // S3: a second «show now» must not move publishedAt.
    it('publish on an already published block writes nothing and keeps publishedAt', async () => {
      repository.findById.mockResolvedValue(record({ publishedAt: at }));

      const result = await service.publish('block');

      expect(repository.publish).not.toHaveBeenCalled();
      expect(revalidation.revalidate).not.toHaveBeenCalled();
      expect(result.publishedAt).toEqual(at);
    });

    it('publish and unpublish revalidate', async () => {
      repository.findById.mockResolvedValue(record({ status: PublishStatus.DRAFT }));
      repository.publish.mockResolvedValue(record({}));
      repository.unpublish.mockResolvedValue(record({ status: PublishStatus.DRAFT }));

      await service.publish('block');
      const hidden = await service.unpublish('block');

      expect(hidden.status).toBe(PublishStatus.DRAFT);
      expect(revalidation.revalidate).toHaveBeenCalledTimes(2);
    });

    it('maps a stale reorder to 409', async () => {
      repository.reorder.mockRejectedValue(new ReorderStaleError());

      await expect(service.reorder({ orderedIds: [] })).rejects.toMatchObject({
        status: 409,
        response: { error: 'REORDER_STALE' },
      });
    });

    it('returns the refreshed admin list after a reorder', async () => {
      repository.reorder.mockResolvedValue([record({ id: 'b' }), record({ id: 'a' })]);

      const result = await service.reorder({ orderedIds: ['b', 'a'] });

      expect(result.map((block) => block.id)).toEqual(['b', 'a']);
      expect(revalidation.revalidate).toHaveBeenCalledWith(target);
    });
  });
});
