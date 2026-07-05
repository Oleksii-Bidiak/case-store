import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { DeviceBrand, DeviceModel, Prisma } from '@prisma/client';

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

  /** List device brands with their model counts (admin listing). */
  async findBrandsWithCount(activeOnly: boolean): Promise<DeviceBrandWithCount[]> {
    const brands = await this.prisma.deviceBrand.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { models: true } } },
    });
    return brands.map((b) => {
      const { _count, ...brand } = b;
      return { brand, modelCount: _count.models };
    });
  }

  findBrandById(id: string): Promise<DeviceBrand | null> {
    return this.prisma.deviceBrand.findUnique({ where: { id } });
  }

  findBrandBySlug(slug: string): Promise<DeviceBrand | null> {
    return this.prisma.deviceBrand.findUnique({ where: { slug } });
  }

  createBrand(data: CreateDeviceBrandInput & { slug: string }): Promise<DeviceBrand> {
    return this.prisma.deviceBrand.create({
      data: {
        name: data.name,
        slug: data.slug,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      },
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
