import { Injectable } from '@nestjs/common';
import { Carousel, HomeBlockType, Prisma, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import type { PublishablePort, RevalidateTarget } from '../publishing';
import { ReorderTx, acquireAdvisoryLocks, lockKey, reorderBucket } from '../common/reorder';

/**
 * Advisory-lock namespace for homepage blocks. MANDATORY prefix: advisory locks are
 * DATABASE-GLOBAL, so without it the homepage would serialise against an unrelated
 * resource's bucket of the same name.
 */
const LOCK_RESOURCE = 'home-blocks';

/** The homepage is ONE list — one bucket, one lock. */
const PAGE_LOCK_KEY = lockKey(LOCK_RESOURCE, null);

/** Any client the reads accept: the injected singleton or an interactive-transaction client. */
type HomeBlockDbClient = PrismaService | ReorderTx;

/** What every read loads alongside a block: its carousel and its tabs, in order. */
const WITH_CONTENT = {
  carousel: true,
  tabs: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    include: { carousel: true },
  },
} satisfies Prisma.HomeBlockInclude;

/** Page order — the tiebreak is part of the contract the backfill gate asserts. */
const PAGE_ORDER: Prisma.HomeBlockOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
];

/** One tab of a TABS block, with the carousel it shows. */
export interface HomeBlockTabRecord {
  carouselId: string;
  sortOrder: number;
  carousel: Carousel;
}

/**
 * A homepage block as the repository hands it to the service: the row plus the
 * carousel it shows (CAROUSEL) or its ordered tabs (TABS), loaded in ONE query so the
 * public read never fans out per block.
 */
export interface HomeBlockRecord {
  id: string;
  type: HomeBlockType;
  title: string | null;
  sortOrder: number;
  status: PublishStatus;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  carouselId: string | null;
  carousel: Carousel | null;
  tabs: HomeBlockTabRecord[];
  createdAt: Date;
  updatedAt: Date;
}

/** Fields for a new block. Publish fields are pre-resolved by the service. */
export interface CreateHomeBlockInput {
  type: HomeBlockType;
  title: string | null;
  carouselId: string | null;
  /** Carousel ids of the tabs, in order (TABS only). */
  tabCarouselIds: readonly string[];
  /** 0-based slot to insert at; absent = append. */
  position?: number;
  status: PublishStatus;
  publishedAt: Date | null;
  scheduledAt: Date | null;
}

/** Fields for an edit. Only provided fields are written; `tabCarouselIds` REPLACES the tabs. */
export interface UpdateHomeBlockInput {
  title?: string;
  carouselId?: string;
  tabCarouselIds?: readonly string[];
  status?: PublishStatus;
  publishedAt?: Date | null;
  scheduledAt?: Date | null;
}

/**
 * All Prisma access for `HomeBlock` + `HomeBlockTab` (TASK-661). Registered under
 * `PUBLISHABLE_REPOSITORY`, so a SCHEDULED block goes live on the same cron tick as
 * banners and carousels.
 */
@Injectable()
export class HomeBlockRepository implements PublishablePort {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The homepage cache. `carousels` too: the storefront caches carousel-derived data
   * under that tag, and a block going live changes what the page shows of it.
   */
  readonly revalidateTarget: RevalidateTarget = {
    tags: ['home-blocks', 'carousels'],
    paths: ['/'],
  };

  /**
   * The blocks of the page, in page order, with their carousels and tabs. PUBLISHED
   * only unless `includeUnpublished` (a signed preview, TASK-668). Carousel visibility
   * is NOT filtered here — that rule is `visibleHomeBlocks`, applied by the service.
   *
   * Accepts a transaction client so the backfill gate can read inside its rolled-back
   * transaction.
   */
  async findForPage(
    params: { includeUnpublished: boolean },
    client: HomeBlockDbClient = this.prisma,
  ): Promise<HomeBlockRecord[]> {
    const rows = await client.homeBlock.findMany({
      where: params.includeUnpublished ? {} : { status: PublishStatus.PUBLISHED },
      orderBy: PAGE_ORDER,
      include: WITH_CONTENT,
    });
    return rows.map(toRecord);
  }

  /** Every block of every status, in page order (admin list). */
  async findAll(client: HomeBlockDbClient = this.prisma): Promise<HomeBlockRecord[]> {
    const rows = await client.homeBlock.findMany({ orderBy: PAGE_ORDER, include: WITH_CONTENT });
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<HomeBlockRecord | null> {
    const row = await this.prisma.homeBlock.findUnique({ where: { id }, include: WITH_CONTENT });
    return row ? toRecord(row) : null;
  }

  /**
   * Add a block — APPENDED (`max + 1`) or inserted at `position` (every block at or
   * after it moves down one) — together with its tabs, in ONE transaction holding the
   * page's advisory lock. Same shape as `BannerRepository.create`: the `max` read and
   * the shift happen under the lock, so a concurrent add or reorder cannot hand out
   * the same slot twice.
   */
  create(input: CreateHomeBlockInput): Promise<HomeBlockRecord> {
    return this.prisma.$transaction(async (tx) => {
      await acquireAdvisoryLocks(tx, [PAGE_LOCK_KEY]);

      const next = await this.nextSortOrder(tx);
      let sortOrder = next;
      if (input.position !== undefined && input.position < next) {
        sortOrder = input.position;
        await tx.homeBlock.updateMany({
          where: { sortOrder: { gte: sortOrder } },
          data: { sortOrder: { increment: 1 } },
        });
      }

      const created = await tx.homeBlock.create({
        data: {
          type: input.type,
          title: input.title,
          carouselId: input.carouselId,
          sortOrder,
          status: input.status,
          publishedAt: input.publishedAt,
          scheduledAt: input.scheduledAt,
          tabs: {
            create: input.tabCarouselIds.map((carouselId, index) => ({
              carouselId,
              sortOrder: index,
            })),
          },
        },
        include: WITH_CONTENT,
      });
      return toRecord(created);
    });
  }

  /** The append slot of the page: `max(sortOrder) + 1`, or 0 when it is empty. */
  private async nextSortOrder(tx: ReorderTx): Promise<number> {
    const { _max } = await tx.homeBlock.aggregate({ _max: { sortOrder: true } });
    return _max.sortOrder === null ? 0 : _max.sortOrder + 1;
  }

  /**
   * Edit a block in place; `tabCarouselIds` replaces the tab list in the same
   * transaction (delete + recreate in order). The position does not change here — that
   * is the reorder endpoint's job.
   */
  update(id: string, input: UpdateHomeBlockInput): Promise<HomeBlockRecord> {
    return this.prisma.$transaction(async (tx) => {
      if (input.tabCarouselIds !== undefined) {
        await tx.homeBlockTab.deleteMany({ where: { homeBlockId: id } });
        if (input.tabCarouselIds.length > 0) {
          await tx.homeBlockTab.createMany({
            data: input.tabCarouselIds.map((carouselId, index) => ({
              homeBlockId: id,
              carouselId,
              sortOrder: index,
            })),
          });
        }
      }
      const updated = await tx.homeBlock.update({
        where: { id },
        data: {
          title: input.title,
          carouselId: input.carouselId,
          status: input.status,
          publishedAt: input.publishedAt,
          scheduledAt: input.scheduledAt,
        },
        include: WITH_CONTENT,
      });
      return toRecord(updated);
    });
  }

  /** Show now: PUBLISHED, `publishedAt = now`, schedule cleared. */
  async publish(id: string, now: Date = new Date()): Promise<HomeBlockRecord> {
    const row = await this.prisma.homeBlock.update({
      where: { id },
      data: { status: PublishStatus.PUBLISHED, publishedAt: now, scheduledAt: null },
      include: WITH_CONTENT,
    });
    return toRecord(row);
  }

  /** Hide: back to DRAFT, both timestamps cleared. The block keeps its place. */
  async unpublish(id: string): Promise<HomeBlockRecord> {
    const row = await this.prisma.homeBlock.update({
      where: { id },
      data: { status: PublishStatus.DRAFT, publishedAt: null, scheduledAt: null },
      include: WITH_CONTENT,
    });
    return toRecord(row);
  }

  /** Remove a block; its tabs cascade. The carousels themselves are untouched. */
  async delete(id: string): Promise<void> {
    await this.prisma.homeBlock.delete({ where: { id } });
  }

  /**
   * Rewrite the complete page order and return the refreshed list, read in the same
   * advisory-locked transaction. Throws the domain errors of `common/reorder`.
   */
  reorder(orderedIds: readonly string[]): Promise<HomeBlockRecord[]> {
    return reorderBucket<HomeBlockRecord[]>(this.prisma, {
      resource: LOCK_RESOURCE,
      bucket: null,
      orderedIds,
      snapshot: (tx) => tx.homeBlock.findMany({ select: { id: true, sortOrder: true } }),
      delegate: (tx) => tx.homeBlock,
      result: (tx) => this.findAll(tx),
    });
  }

  /**
   * {@link PublishablePort.publishDue} — flip every SCHEDULED block whose time has come
   * to PUBLISHED. Returns the count flipped.
   */
  async publishDue(now: Date): Promise<number> {
    const { count } = await this.prisma.homeBlock.updateMany({
      where: { status: PublishStatus.SCHEDULED, scheduledAt: { lte: now } },
      data: { status: PublishStatus.PUBLISHED, publishedAt: now, scheduledAt: null },
    });
    return count;
  }
}

type HomeBlockRow = Prisma.HomeBlockGetPayload<{ include: typeof WITH_CONTENT }>;

function toRecord(row: HomeBlockRow): HomeBlockRecord {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    sortOrder: row.sortOrder,
    status: row.status,
    publishedAt: row.publishedAt,
    scheduledAt: row.scheduledAt,
    carouselId: row.carouselId,
    carousel: row.carousel,
    tabs: row.tabs.map((tab) => ({
      carouselId: tab.carouselId,
      sortOrder: tab.sortOrder,
      carousel: tab.carousel,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
