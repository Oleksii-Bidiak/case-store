import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { DeviceBrand, DeviceModel, Prisma } from '@prisma/client';
import { ReorderTx, acquireAdvisoryLocks, lockKey, reorderBucket } from '../common/reorder';

/**
 * Advisory-lock namespace for device brands (TASK-295). The prefix is MANDATORY — locks are
 * DATABASE-GLOBAL and every flat resource has a `__root__` bucket, so without it a brand
 * reorder would serialise against an unrelated resource's.
 */
const LOCK_RESOURCE = 'device-brands';

/** Device brands are ONE global list — a single, null-keyed bucket. */
const BUCKET_LOCK_KEY = lockKey(LOCK_RESOURCE, null);

/** Page size used when the admin asks for a page but names no `limit` (TASK-357). */
const DEFAULT_ADMIN_PAGE_SIZE = 20;

/**
 * Parameters for querying device models with optional filtering + pagination.
 */
export interface FindModelsParams {
  page?: number;
  limit?: number;
  deviceBrandId?: string;
  series?: string;
  search?: string;
  /** Explicit visibility filter — `undefined` means all statuses (admin). */
  isActive?: boolean;
}

/** Allowed fields for creating a device brand. */
export interface CreateDeviceBrandInput {
  name: string;
  slug?: string;
  sortOrder?: number;
  isActive?: boolean;
}

/** Allowed fields for updating a device brand. */
export interface UpdateDeviceBrandInput {
  name?: string;
  slug?: string;
  sortOrder?: number;
  isActive?: boolean;
}

/** Allowed fields for creating a device model. */
export interface CreateDeviceModelInput {
  deviceBrandId: string;
  name: string;
  slug?: string;
  series?: string | null;
  releaseYear?: number | null;
  isActive?: boolean;
}

/** Allowed fields for updating a device model. */
export interface UpdateDeviceModelInput {
  deviceBrandId?: string;
  name?: string;
  slug?: string;
  series?: string | null;
  releaseYear?: number | null;
  isActive?: boolean;
}

/** A device model row with its brand relation loaded (for labelling). */
export type DeviceModelWithBrand = DeviceModel & { brand: { name: string } };

/** Result of a paginated device model query. */
export interface PaginatedDeviceModelsResult {
  models: DeviceModelWithBrand[];
  total: number;
}

/** A device brand row with its model count (for admin listings). */
export interface DeviceBrandWithCount {
  brand: DeviceBrand;
  modelCount: number;
}

/**
 * Filter params for the ADMIN device-brand list. `page` / `limit` are OPTIONAL
 * and jointly opt-in: with both absent the read returns the complete list, which
 * is what the drag-and-drop reorder UI requires.
 */
export interface FindAdminBrandsParams {
  page?: number;
  limit?: number;
  search?: string;
}

/** Result of an admin brand query — `total` counts rows matching the filters. */
export interface PaginatedDeviceBrandsResult {
  brands: DeviceBrandWithCount[];
  total: number;
}

/**
 * DeviceRepository — all Prisma access for the device-compatibility taxonomy
 * (TASK-190). Covers BOTH `DeviceBrand` and `DeviceModel` — a small,
 * tightly-coupled taxonomy owned by one repository (like `CategoryRepository`
 * owns the self-referential category tree).
 */
@Injectable()
export class DeviceRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Device brands ────────────────────────────────────────────────────────

  /** List device brands, ordered by sortOrder then name. */
  findBrands(activeOnly: boolean): Promise<DeviceBrand[]> {
    return this.prisma.deviceBrand.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * List device brands with their model counts, any status — the ADMIN listing, with an
   * optional name search and opt-in pagination (TASK-357).
   *
   * Accepts a transaction client (TASK-295) so the reorder endpoint can re-read the
   * refreshed list inside its own transaction.
   *
   * With neither `page` nor `limit` the query keeps its pre-TASK-357 shape — no `skip`/
   * `take`, and `total` comes from the rows we already hold rather than a second `count`
   * round-trip. Ordering stays `sortOrder` ASC in every mode: it is the operator's own
   * hand-set order, so a paginated page must slice that same sequence.
   */
  async findBrandsWithCount(
    params: FindAdminBrandsParams = {},
    client: PrismaService | ReorderTx = this.prisma,
  ): Promise<PaginatedDeviceBrandsResult> {
    const where: Prisma.DeviceBrandWhereInput = {
      ...(params.search && { name: { contains: params.search, mode: 'insensitive' } }),
    };
    const query = {
      where,
      orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }],
      include: { _count: { select: { models: true } } },
    };

    const withCount = (rows: { _count: { models: number } }[]): DeviceBrandWithCount[] =>
      rows.map((row) => {
        const { _count, ...brand } = row;
        return { brand: brand as DeviceBrand, modelCount: _count.models };
      });

    if (params.page === undefined && params.limit === undefined) {
      const rows = await client.deviceBrand.findMany(query);
      const brands = withCount(rows);
      return { brands, total: brands.length };
    }

    const limit = params.limit ?? DEFAULT_ADMIN_PAGE_SIZE;
    const skip = ((params.page ?? 1) - 1) * limit;

    const [rows, total] = await Promise.all([
      client.deviceBrand.findMany({ ...query, skip, take: limit }),
      client.deviceBrand.count({ where }),
    ]);

    return { brands: withCount(rows), total };
  }

  /**
   * Rewrite the complete ordering of the (single, global) device-brand list and return the
   * refreshed ADMIN list — with model counts — read inside the same transaction (TASK-295).
   *
   * Throws the domain errors of `common/reorder/reorder.errors.ts`; the service maps them.
   */
  reorderBrands(orderedIds: readonly string[]): Promise<PaginatedDeviceBrandsResult> {
    return reorderBucket<PaginatedDeviceBrandsResult>(this.prisma, {
      resource: LOCK_RESOURCE,
      bucket: null,
      orderedIds,
      snapshot: (tx) => tx.deviceBrand.findMany({ select: { id: true } }),
      delegate: (tx) => tx.deviceBrand,
      result: (tx) => this.findBrandsWithCount({}, tx),
    });
  }

  findBrandById(id: string): Promise<DeviceBrand | null> {
    return this.prisma.deviceBrand.findUnique({ where: { id } });
  }

  findBrandBySlug(slug: string): Promise<DeviceBrand | null> {
    return this.prisma.deviceBrand.findUnique({ where: { slug } });
  }

  /**
   * Create a brand, APPENDED to the end of the list (`sortOrder = max + 1`, `0` when the
   * list is empty) — TASK-295.
   *
   * The old `data.sortOrder ?? 0` default lands every new brand ON TOP OF the first one once
   * the admin form stops sending a hand-typed `sortOrder` (which the reorder UI removes).
   * Same shape as `CategoryRepository.create`: the `max + 1` read runs inside a transaction
   * holding the bucket's advisory lock, so it cannot race a concurrent append or a
   * concurrent `reorderBrands` and hand out a duplicate slot. An explicit `data.sortOrder`
   * still wins — the append is only the default.
   */
  createBrand(data: CreateDeviceBrandInput & { slug: string }): Promise<DeviceBrand> {
    return this.prisma.$transaction(async (tx) => {
      await acquireAdvisoryLocks(tx, [BUCKET_LOCK_KEY]);

      let sortOrder = data.sortOrder;
      if (sortOrder === undefined) {
        const { _max } = await tx.deviceBrand.aggregate({ _max: { sortOrder: true } });
        sortOrder = _max.sortOrder === null ? 0 : _max.sortOrder + 1;
      }

      return tx.deviceBrand.create({
        data: {
          name: data.name,
          slug: data.slug,
          sortOrder,
          isActive: data.isActive ?? true,
        },
      });
    });
  }

  updateBrand(id: string, data: UpdateDeviceBrandInput): Promise<DeviceBrand> {
    return this.prisma.deviceBrand.update({ where: { id }, data });
  }

  // ─── Device models ────────────────────────────────────────────────────────

  /**
   * List device models with optional brand/series/search filters and
   * pagination. Ordered by releaseYear desc (newest first), then name.
   */
  async findModels(params: FindModelsParams): Promise<PaginatedDeviceModelsResult> {
    const { page = 1, limit = 50, deviceBrandId, series, search, isActive } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.DeviceModelWhereInput = {};
    if (isActive !== undefined) {
      where.isActive = isActive;
    }
    if (deviceBrandId) {
      where.deviceBrandId = deviceBrandId;
    }
    if (series) {
      where.series = series;
    }
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [models, total] = await Promise.all([
      this.prisma.deviceModel.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ releaseYear: 'desc' }, { name: 'asc' }],
        include: { brand: { select: { name: true } } },
      }),
      this.prisma.deviceModel.count({ where }),
    ]);

    return { models, total };
  }

  findModelById(id: string): Promise<DeviceModelWithBrand | null> {
    return this.prisma.deviceModel.findUnique({
      where: { id },
      include: { brand: { select: { name: true } } },
    });
  }

  findModelBySlug(slug: string): Promise<DeviceModel | null> {
    return this.prisma.deviceModel.findUnique({ where: { slug } });
  }

  /**
   * Resolve a set of device model ids to their full rows (with brand). Used to
   * validate a compat assignment before writing. Returns only the ids that
   * exist — the caller diffs against the requested set to reject unknown ids.
   */
  findModelsByIds(ids: string[]): Promise<DeviceModelWithBrand[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.prisma.deviceModel.findMany({
      where: { id: { in: ids } },
      include: { brand: { select: { name: true } } },
    });
  }

  createModel(data: CreateDeviceModelInput & { slug: string }): Promise<DeviceModel> {
    return this.prisma.deviceModel.create({
      data: {
        deviceBrandId: data.deviceBrandId,
        name: data.name,
        slug: data.slug,
        series: data.series ?? null,
        releaseYear: data.releaseYear ?? null,
        isActive: data.isActive ?? true,
      },
    });
  }

  updateModel(id: string, data: UpdateDeviceModelInput): Promise<DeviceModel> {
    return this.prisma.deviceModel.update({ where: { id }, data });
  }
}
