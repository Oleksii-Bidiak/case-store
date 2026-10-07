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
  findUniqueOrThrow: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  deleteMany: jest.fn(),
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

  const newBlock = {
    type: HomeBlockType.CAROUSEL,
    title: null,
    carouselId: 'c1',
    tabCarouselIds: [] as string[],
    status: PublishStatus.DRAFT,
    publishedAt: null,
    scheduledAt: null,
  };

  /** The sortOrder writes the renumbering made, as `[id, sortOrder]`. */
  const sortOrderWrites = () =>
    homeBlock.updateMany.mock.calls.map(
      ([args]: [{ where: { id: string }; data: { sortOrder: number } }]) => [
        args.where.id,
        args.data.sortOrder,
      ],
    );

  it('appends under the page lock: lock BEFORE the page read, slot = n, tabs in order', async () => {
    homeBlock.findMany.mockResolvedValue([
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 1 },
    ]);

    await repository.create({
      ...newBlock,
      type: HomeBlockType.TABS,
      title: 'X',
      carouselId: null,
      tabCarouselIds: ['a', 'b'],
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      homeBlock.findMany.mock.invocationCallOrder[0],
    );
    expect(homeBlock.findMany).toHaveBeenCalledWith({
      select: { id: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(homeBlock.updateMany).not.toHaveBeenCalled();
    expect(homeBlock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sortOrder: 2,
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

  // W3: `position` is an index into the page, whatever the stored numbers are.
  it('inserts at a 0-based INDEX of the page order, not at a raw sortOrder, and renumbers densely', async () => {
    // Gaps and a tie, as an old page could carry them.
    homeBlock.findMany.mockResolvedValue([
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 5 },
      { id: 'c', sortOrder: 5 },
      { id: 'd', sortOrder: 9 },
    ]);
    homeBlock.create.mockResolvedValue({ ...row, id: 'new' });

    await repository.create({ ...newBlock, position: 2 });

    expect(homeBlock.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sortOrder: 2 }) }),
    );
    // a stays at 0, new is created AT 2; only the rows off their index are written.
    expect(sortOrderWrites()).toEqual([
      ['b', 1],
      ['c', 3],
      ['d', 4],
    ]);
  });

  it('inserts at position 0 as the first block', async () => {
    homeBlock.findMany.mockResolvedValue([
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 1 },
    ]);
    homeBlock.create.mockResolvedValue({ ...row, id: 'new' });

    await repository.create({ ...newBlock, position: 0 });

    expect(homeBlock.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sortOrder: 0 }) }),
    );
    expect(sortOrderWrites()).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('treats a position past the end as an append', async () => {
    homeBlock.findMany.mockResolvedValue([
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 1 },
      { id: 'c', sortOrder: 2 },
    ]);
    homeBlock.create.mockResolvedValue({ ...row, id: 'new' });

    await repository.create({ ...newBlock, position: 40 });

    expect(homeBlock.updateMany).not.toHaveBeenCalled();
    expect(homeBlock.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sortOrder: 3 }) }),
    );
  });

  it('replaces the tab list under the page lock, AFTER writing the block row', async () => {
    homeBlock.findUniqueOrThrow.mockResolvedValue(row);

    await repository.update('block', { tabCarouselIds: ['b', 'a'] });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      homeBlockTab.deleteMany.mock.invocationCallOrder[0],
    );
    // The block row first: a block deleted underneath answers P2025 (404), not an FK error.
    expect(homeBlock.update.mock.invocationCallOrder[0]).toBeLessThan(
      homeBlockTab.deleteMany.mock.invocationCallOrder[0],
    );
    expect(homeBlockTab.deleteMany).toHaveBeenCalledWith({ where: { homeBlockId: 'block' } });
    expect(homeBlockTab.createMany).toHaveBeenCalledWith({
      data: [
        { homeBlockId: 'block', carouselId: 'b', sortOrder: 0 },
        { homeBlockId: 'block', carouselId: 'a', sortOrder: 1 },
      ],
    });
  });

  it('leaves the tabs and the lock alone when the edit does not name them', async () => {
    homeBlock.findUniqueOrThrow.mockResolvedValue(row);

    await repository.update('block', { title: 'Y' });

    expect(homeBlockTab.deleteMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('never writes null for a field it was handed as null (defence in depth)', async () => {
    homeBlock.findUniqueOrThrow.mockResolvedValue(row);

    await repository.update('block', {
      title: null,
      carouselId: null,
      tabCarouselIds: null,
    } as unknown as Parameters<HomeBlockRepository['update']>[1]);

    expect(homeBlock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: undefined, carouselId: undefined }),
      }),
    );
    expect(homeBlockTab.deleteMany).not.toHaveBeenCalled();
  });

  // W3: delete compacts the page so `position` and the stored order agree.
  it('deletes under the page lock and compacts the page to 0..n-1', async () => {
    homeBlock.deleteMany.mockResolvedValue({ count: 1 });
    homeBlock.findMany.mockResolvedValue([
      { id: 'a', sortOrder: 0 },
      { id: 'c', sortOrder: 2 },
      { id: 'd', sortOrder: 3 },
    ]);

    await expect(repository.delete('b')).resolves.toBe(true);

    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      homeBlock.deleteMany.mock.invocationCallOrder[0],
    );
    expect(homeBlock.deleteMany).toHaveBeenCalledWith({ where: { id: 'b' } });
    expect(sortOrderWrites()).toEqual([
      ['c', 1],
      ['d', 2],
    ]);
  });

  it('reports a block that was already gone instead of throwing', async () => {
    homeBlock.deleteMany.mockResolvedValue({ count: 0 });

    await expect(repository.delete('gone')).resolves.toBe(false);
    expect(homeBlock.findMany).not.toHaveBeenCalled();
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
