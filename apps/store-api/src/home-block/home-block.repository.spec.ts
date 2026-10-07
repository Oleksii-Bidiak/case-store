import { HomeBlockType, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { HomeBlockRepository } from './home-block.repository';

const row = {
  id: 'block',
  type: HomeBlockType.CAROUSEL,
  title: null,
  sortOrder: 4,
  status: PublishStatus.PUBLISHED,
  publishedAt: null,
  scheduledAt: null,
  carouselId: 'c1',
  carousel: null,
  tabs: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** One delegate shared by the singleton client and the transaction client. */
const homeBlock = {
  findMany: jest.fn(),
  findUnique: jest.fn(),
  aggregate: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  delete: jest.fn(),
};
const homeBlockTab = { deleteMany: jest.fn(), createMany: jest.fn() };
const tx = { homeBlock, homeBlockTab, $executeRaw: jest.fn() };
const prisma = {
  homeBlock,
  homeBlockTab,
  $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
};

describe('HomeBlockRepository (TASK-661)', () => {
  let repository: HomeBlockRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    homeBlock.create.mockResolvedValue(row);
    homeBlock.update.mockResolvedValue(row);
    repository = new HomeBlockRepository(prisma as unknown as PrismaService);
  });

  it('reads the public page PUBLISHED-only in page order with carousels and tabs in ONE query', async () => {
    homeBlock.findMany.mockResolvedValue([row]);

    await repository.findForPage({ includeUnpublished: false });

    expect(homeBlock.findMany).toHaveBeenCalledTimes(1);
    expect(homeBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: PublishStatus.PUBLISHED },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        include: expect.objectContaining({ carousel: true, tabs: expect.anything() }),
      }),
    );
  });

  it('reads every status for a preview', async () => {
    homeBlock.findMany.mockResolvedValue([]);
    await repository.findForPage({ includeUnpublished: true });
    expect(homeBlock.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('appends under the page lock: lock BEFORE the max read, max + 1, tabs in order', async () => {
    homeBlock.aggregate.mockResolvedValue({ _max: { sortOrder: 8 } });

    await repository.create({
      type: HomeBlockType.TABS,
      title: 'X',
      carouselId: null,
      tabCarouselIds: ['a', 'b'],
      status: PublishStatus.DRAFT,
      publishedAt: null,
      scheduledAt: null,
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      homeBlock.aggregate.mock.invocationCallOrder[0],
    );
    expect(homeBlock.updateMany).not.toHaveBeenCalled();
    expect(homeBlock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sortOrder: 9,
          tabs: {
            create: [
              { carouselId: 'a', sortOrder: 0 },
              { carouselId: 'b', sortOrder: 1 },
            ],
          },
        }),
      }),
    );
  });

  it('inserts at a position by moving every later block down one, under the same lock', async () => {
    homeBlock.aggregate.mockResolvedValue({ _max: { sortOrder: 8 } });

    await repository.create({
      type: HomeBlockType.CAROUSEL,
      title: null,
      carouselId: 'c1',
      tabCarouselIds: [],
      position: 4,
      status: PublishStatus.PUBLISHED,
      publishedAt: null,
      scheduledAt: null,
    });

    expect(homeBlock.updateMany).toHaveBeenCalledWith({
      where: { sortOrder: { gte: 4 } },
      data: { sortOrder: { increment: 1 } },
    });
    expect(homeBlock.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sortOrder: 4 }) }),
    );
  });

  it('treats a position past the end as an append', async () => {
    homeBlock.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });

    await repository.create({
      type: HomeBlockType.CAROUSEL,
      title: null,
      carouselId: 'c1',
      tabCarouselIds: [],
      position: 40,
      status: PublishStatus.DRAFT,
      publishedAt: null,
      scheduledAt: null,
    });

    expect(homeBlock.updateMany).not.toHaveBeenCalled();
    expect(homeBlock.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sortOrder: 3 }) }),
    );
  });

  it('replaces the tab list in the same transaction as the block edit', async () => {
    await repository.update('block', { tabCarouselIds: ['b', 'a'] });

    expect(homeBlockTab.deleteMany).toHaveBeenCalledWith({ where: { homeBlockId: 'block' } });
    expect(homeBlockTab.createMany).toHaveBeenCalledWith({
      data: [
        { homeBlockId: 'block', carouselId: 'b', sortOrder: 0 },
        { homeBlockId: 'block', carouselId: 'a', sortOrder: 1 },
      ],
    });
  });

  it('leaves the tabs alone when the edit does not name them', async () => {
    await repository.update('block', { title: 'Y' });
    expect(homeBlockTab.deleteMany).not.toHaveBeenCalled();
  });

  it('flips due SCHEDULED blocks live', async () => {
    homeBlock.updateMany.mockResolvedValue({ count: 2 });
    const now = new Date();

    await expect(repository.publishDue(now)).resolves.toBe(2);
    expect(homeBlock.updateMany).toHaveBeenCalledWith({
      where: { status: PublishStatus.SCHEDULED, scheduledAt: { lte: now } },
      data: { status: PublishStatus.PUBLISHED, publishedAt: now, scheduledAt: null },
    });
  });

  it('purges the homepage tags when the scheduler flips rows', () => {
    expect(repository.revalidateTarget).toEqual({
      tags: ['home-blocks', 'carousels'],
      paths: ['/'],
    });
  });
});
