import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Carousel, HomeBlockType, PublishStatus } from '@prisma/client';
import { CarouselService, PublicCarouselEntity } from '../carousels';
import { RevalidationNotifier, resolvePublishState } from '../publishing';
import { reorderErrorToHttp } from '../common/reorder';
import {
  HomeBlockRecord,
  HomeBlockRepository,
  UpdateHomeBlockInput,
} from './home-block.repository';
import { CreateHomeBlockDto, ReorderHomeBlocksDto, UpdateHomeBlockDto } from './dto';
import {
  HomeBlockCarouselSummaryEntity,
  HomeBlockEntity,
  HomeBlockTabEntity,
  PublicHomeBlockEntity,
} from './entities';
import { isSystemHomeBlockType, visibleHomeBlocks } from './home-block.rules';

/** Stable error codes the admin screen keys its messages off. */
export const HomeBlockErrorCode = {
  SYSTEM: 'HOME_BLOCK_SYSTEM',
  FIELD_NOT_ALLOWED: 'HOME_BLOCK_FIELD_NOT_ALLOWED',
} as const;

/**
 * The homepage as a list of blocks (TASK-661, plan 186).
 *
 * Content stays where it is edited — carousels resolve their products through
 * `CarouselService.resolvePublic`, the one place that logic lives — and this service
 * decides only which sections stand on the page, where, and whether they are live.
 */
@Injectable()
export class HomeBlockService {
  constructor(
    private readonly homeBlockRepository: HomeBlockRepository,
    private readonly carouselService: CarouselService,
    private readonly revalidation: RevalidationNotifier,
  ) {}

  /**
   * The storefront homepage: blocks in page order, every carousel resolved with its
   * products in this ONE call (no request per section). `preview` (a valid signed
   * `home` token, TASK-668) also returns DRAFT / SCHEDULED blocks and draft carousels.
   * Visibility is `visibleHomeBlocks` — see its docblock.
   */
  async findPublic(options: { preview?: boolean } = {}): Promise<PublicHomeBlockEntity[]> {
    const preview = options.preview === true;
    const rows = await this.homeBlockRepository.findForPage({ includeUnpublished: preview });
    const blocks = visibleHomeBlocks(rows, preview);

    // Every carousel the page needs, once each, in first-use order.
    const needed = new Map<string, Carousel>();
    for (const block of blocks) {
      if (block.type === HomeBlockType.CAROUSEL && block.carousel) {
        needed.set(block.carousel.id, block.carousel);
      }
      for (const tab of block.type === HomeBlockType.TABS ? block.tabs : []) {
        needed.set(tab.carousel.id, tab.carousel);
      }
    }
    const resolved = new Map<string, PublicCarouselEntity>();
    for (const carousel of await this.carouselService.resolvePublic([...needed.values()])) {
      resolved.set(carousel.id, carousel);
    }

    return blocks.map((block) => {
      const entity = new PublicHomeBlockEntity();
      entity.id = block.id;
      entity.type = block.type;
      entity.title = block.type === HomeBlockType.TABS ? block.title : null;
      entity.sortOrder = block.sortOrder;
      entity.status = block.status;
      entity.carousel =
        block.type === HomeBlockType.CAROUSEL && block.carousel
          ? (resolved.get(block.carousel.id) ?? null)
          : null;
      entity.tabs =
        block.type === HomeBlockType.TABS
          ? block.tabs
              .map((tab) => resolved.get(tab.carousel.id))
              .filter((tab): tab is PublicCarouselEntity => tab !== undefined)
          : [];
      return entity;
    });
  }

  /** Every block of every status, in page order, with the flags the admin screen shows. */
  async findAllAdmin(): Promise<HomeBlockEntity[]> {
    const rows = await this.homeBlockRepository.findAll();
    return rows.map(toAdminEntity);
  }

  async findByIdAdmin(id: string): Promise<HomeBlockEntity> {
    return toAdminEntity(await this.requireBlock(id));
  }

  /**
   * Add a CAROUSEL or TABS block (the DTO already enforced which fields belong to which
   * type). Every carousel it names must exist — any status: a block may be prepared for
   * a carousel that is still a draft, and stays hidden until it is published. The same
   * carousel may stand in two blocks; the admin screen warns, the API allows it.
   */
  async create(dto: CreateHomeBlockDto): Promise<HomeBlockEntity> {
    const tabCarouselIds = dto.type === HomeBlockType.TABS ? (dto.tabs ?? []) : [];
    const carouselId = dto.type === HomeBlockType.CAROUSEL ? (dto.carouselId ?? null) : null;
    await this.assertCarouselsExist([...(carouselId ? [carouselId] : []), ...tabCarouselIds]);

    const publishState = resolvePublishState(
      { status: dto.status ?? PublishStatus.DRAFT, scheduledAt: parseDate(dto.scheduledAt) },
      new Date(),
    );

    const created = await this.homeBlockRepository.create({
      type: dto.type,
      title: dto.type === HomeBlockType.TABS ? (dto.title ?? null) : null,
      carouselId,
      tabCarouselIds,
      position: dto.position,
      ...publishState,
    });
    if (created.status === PublishStatus.PUBLISHED) {
      await this.notifyRevalidation();
    }
    return toAdminEntity(created);
  }

  /**
   * Edit a block: title / tabs (TABS), the carousel (CAROUSEL), publish state (any).
   * A field that does not belong to the stored type is a 400 — the type is fixed.
   */
  async update(id: string, dto: UpdateHomeBlockDto): Promise<HomeBlockEntity> {
    const block = await this.requireBlock(id);
    this.assertFieldsFitType(block.type, dto);

    const input: UpdateHomeBlockInput = {
      title: dto.title,
      carouselId: dto.carouselId,
      tabCarouselIds: dto.tabs,
    };
    await this.assertCarouselsExist([
      ...(dto.carouselId ? [dto.carouselId] : []),
      ...(dto.tabs ?? []),
    ]);

    const wasPublished = block.status === PublishStatus.PUBLISHED;
    if (dto.status !== undefined) {
      const resolved = resolvePublishState(
        { status: dto.status, scheduledAt: parseDate(dto.scheduledAt) },
        new Date(),
      );
      input.status = resolved.status;
      input.scheduledAt = resolved.scheduledAt;
      // Re-saving a live block must not reset when it went live.
      input.publishedAt =
        resolved.status === PublishStatus.PUBLISHED && wasPublished && block.publishedAt
          ? block.publishedAt
          : resolved.publishedAt;
    }

    const updated = await this.homeBlockRepository.update(id, input);
    if (wasPublished || updated.status === PublishStatus.PUBLISHED) {
      await this.notifyRevalidation();
    }
    return toAdminEntity(updated);
  }

  /** Show now. */
  async publish(id: string): Promise<HomeBlockEntity> {
    await this.requireBlock(id);
    const block = await this.homeBlockRepository.publish(id);
    await this.notifyRevalidation();
    return toAdminEntity(block);
  }

  /** Hide (back to draft) — the block keeps its place on the page. */
  async unpublish(id: string): Promise<HomeBlockEntity> {
    await this.requireBlock(id);
    const block = await this.homeBlockRepository.unpublish(id);
    await this.notifyRevalidation();
    return toAdminEntity(block);
  }

  /**
   * Remove a CAROUSEL or TABS block from the page. The carousels stay in «Каруселі».
   * A singleton block cannot be removed — only hidden or moved (409 HOME_BLOCK_SYSTEM).
   */
  async delete(id: string): Promise<void> {
    const block = await this.requireBlock(id);
    if (isSystemHomeBlockType(block.type)) {
      throw new ConflictException({
        error: HomeBlockErrorCode.SYSTEM,
        message:
          'This block is part of every homepage and cannot be removed — hide it or move it instead',
      });
    }
    await this.homeBlockRepository.delete(id);
    if (block.status === PublishStatus.PUBLISHED) {
      await this.notifyRevalidation();
    }
  }

  /** Rewrite the page order; returns the refreshed admin list. */
  async reorder(dto: ReorderHomeBlocksDto): Promise<HomeBlockEntity[]> {
    let rows: HomeBlockRecord[];
    try {
      rows = await this.homeBlockRepository.reorder(dto.orderedIds);
    } catch (error) {
      throw reorderErrorToHttp(error);
    }
    if (rows.some((row) => row.status === PublishStatus.PUBLISHED)) {
      await this.notifyRevalidation();
    }
    return rows.map(toAdminEntity);
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async requireBlock(id: string): Promise<HomeBlockRecord> {
    const block = await this.homeBlockRepository.findById(id);
    if (!block) {
      throw new NotFoundException('Home block not found');
    }
    return block;
  }

  private assertFieldsFitType(type: HomeBlockType, dto: UpdateHomeBlockDto): void {
    const stray: string[] = [];
    if (dto.carouselId !== undefined && type !== HomeBlockType.CAROUSEL) stray.push('carouselId');
    if (dto.title !== undefined && type !== HomeBlockType.TABS) stray.push('title');
    if (dto.tabs !== undefined && type !== HomeBlockType.TABS) stray.push('tabs');
    if (stray.length > 0) {
      throw new BadRequestException({
        error: HomeBlockErrorCode.FIELD_NOT_ALLOWED,
        message: `${stray.join(', ')} cannot be set on a ${type} block`,
      });
    }
  }

  private async assertCarouselsExist(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const unique = [...new Set(ids)];
    const found = await this.carouselService.findByIds(unique);
    if (found.length !== unique.length) {
      throw new NotFoundException('Carousel not found');
    }
  }

  /** Best-effort storefront revalidation after an admin write. Never throws. */
  private async notifyRevalidation(): Promise<void> {
    await this.revalidation.revalidate(this.homeBlockRepository.revalidateTarget);
  }
}

function parseDate(value?: string | null): Date | null {
  return value ? new Date(value) : null;
}

function toCarouselSummary(carousel: Carousel): HomeBlockCarouselSummaryEntity {
  const summary = new HomeBlockCarouselSummaryEntity();
  summary.id = carousel.id;
  summary.title = carousel.title;
  summary.source = carousel.source;
  summary.status = carousel.status;
  return summary;
}

function toAdminEntity(block: HomeBlockRecord): HomeBlockEntity {
  const entity = new HomeBlockEntity();
  entity.id = block.id;
  entity.type = block.type;
  entity.title = block.title;
  entity.sortOrder = block.sortOrder;
  entity.status = block.status;
  entity.publishedAt = block.publishedAt;
  entity.scheduledAt = block.scheduledAt;
  entity.carousel = block.carousel ? toCarouselSummary(block.carousel) : null;
  entity.tabs = block.tabs.map((tab) => {
    const tabEntity = new HomeBlockTabEntity();
    tabEntity.sortOrder = tab.sortOrder;
    tabEntity.carousel = toCarouselSummary(tab.carousel);
    return tabEntity;
  });
  entity.isSystem = isSystemHomeBlockType(block.type);
  entity.isOrphaned = block.type === HomeBlockType.CAROUSEL && block.carousel === null;
  entity.isEmpty =
    (block.type === HomeBlockType.CAROUSEL && block.carousel?.status !== PublishStatus.PUBLISHED) ||
    (block.type === HomeBlockType.TABS &&
      !block.tabs.some((tab) => tab.carousel.status === PublishStatus.PUBLISHED));
  entity.createdAt = block.createdAt;
  entity.updatedAt = block.updatedAt;
  return entity;
}
