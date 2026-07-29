import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  DeviceRepository,
  CreateDeviceBrandInput,
  UpdateDeviceBrandInput,
  CreateDeviceModelInput,
  UpdateDeviceModelInput,
  FindModelsParams,
  FindAdminBrandsParams,
} from './device.repository';
import { DeviceBrandEntity, DeviceModelEntity } from './entities';
import { DeviceModelListQueryDto, DeviceBrandListQueryDto, ReorderDeviceBrandsDto } from './dto';
import { generateSlug } from '../common/utils';
import { reorderErrorToHttp } from '../common/reorder';

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface DeviceBrandListResponse {
  data: DeviceBrandEntity[];
}

/**
 * Admin brand list envelope. `meta` is present even for an unpaginated read so the
 * panel can show a truthful row count without branching on the query — and so the
 * reorder response, which the panel writes straight into the list cache, can carry
 * the identical shape.
 */
interface AdminDeviceBrandListResponse {
  data: DeviceBrandEntity[];
  meta: PaginationMeta;
}

interface DeviceModelListResponse {
  data: DeviceModelEntity[];
}

interface PaginatedDeviceModelsResponse {
  data: DeviceModelEntity[];
  meta: PaginationMeta;
}

/**
 * DeviceService — business logic for the device-compatibility taxonomy
 * (TASK-190): slug auto-generation (mirrors `CategoryService`), slug-uniqueness
 * and brand-existence validation, and envelope mapping. Never touches Prisma
 * directly — all reads/writes go through {@link DeviceRepository}.
 */
@Injectable()
export class DeviceService {
  constructor(
    private readonly deviceRepository: DeviceRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DeviceService.name);
  }

  // ─── Device brands ────────────────────────────────────────────────────────

  /** Public — list active device brands for the picker/filter cascade. */
  async getBrands(activeOnly = true): Promise<DeviceBrandListResponse> {
    const brands = await this.deviceRepository.findBrands(activeOnly);
    return { data: brands.map((b) => DeviceBrandEntity.fromPrisma(b)) };
  }

  /**
   * Admin — list all device brands with their model counts, optionally searched by
   * name and paginated. Omitting `page`/`limit` returns the complete list — the mode
   * the drag-and-drop reorder UI requires (TASK-357).
   */
  async getBrandsWithCount(
    query: DeviceBrandListQueryDto = {},
  ): Promise<AdminDeviceBrandListResponse> {
    const params: FindAdminBrandsParams = {
      page: query.page,
      limit: query.limit,
      search: query.search,
    };
    const { brands, total } = await this.deviceRepository.findBrandsWithCount(params);

    return {
      data: brands.map((r) => DeviceBrandEntity.fromPrisma(r.brand, r.modelCount)),
      meta: this.buildOptionalMeta(total, query.page, query.limit),
    };
  }

  async findBrandById(id: string): Promise<DeviceBrandEntity> {
    const brand = await this.deviceRepository.findBrandById(id);
    if (!brand) {
      throw new NotFoundException('Device brand not found');
    }
    return DeviceBrandEntity.fromPrisma(brand);
  }

  async createBrand(input: CreateDeviceBrandInput): Promise<DeviceBrandEntity> {
    const slug = input.slug ?? generateSlug(input.name);
    const existing = await this.deviceRepository.findBrandBySlug(slug);
    if (existing) {
      throw new ConflictException('A device brand with this slug already exists');
    }
    const brand = await this.deviceRepository.createBrand({ ...input, slug });
    return DeviceBrandEntity.fromPrisma(brand);
  }

  async updateBrand(id: string, input: UpdateDeviceBrandInput): Promise<DeviceBrandEntity> {
    const brand = await this.deviceRepository.findBrandById(id);
    if (!brand) {
      throw new NotFoundException('Device brand not found');
    }
    if (input.slug !== undefined && input.slug !== brand.slug) {
      const existing = await this.deviceRepository.findBrandBySlug(input.slug);
      if (existing && existing.id !== id) {
        throw new ConflictException('A device brand with this slug already exists');
      }
    }
    const updated = await this.deviceRepository.updateBrand(id, input);
    return DeviceBrandEntity.fromPrisma(updated);
  }

  /**
   * Reorder the (single, global) device-brand list (admin, TASK-295) and return the
   * refreshed ADMIN list — with model counts — so the panel resyncs in one round-trip,
   * exactly as the category reorder does.
   *
   * NO REVALIDATION, deliberately: devices have NO storefront cache tag (unlike banners'
   * `['banners']` or the blog's `['blog']`), and the storefront reads brands CLIENT-SIDE
   * through the public `GET /api/devices/brands` — there is no cached server render of this
   * list to purge. Calling `RevalidationNotifier` here would be a no-op at best and a
   * misleading one at worst. Do not "fix" this by inventing a tag; if devices ever gain a
   * server-rendered, cached surface, the tag goes in with it. The structured log line below
   * is the audit trail.
   */
  async reorderBrands(
    dto: ReorderDeviceBrandsDto,
    actorId?: string,
  ): Promise<AdminDeviceBrandListResponse> {
    let brands;
    let total;
    try {
      ({ brands, total } = await this.deviceRepository.reorderBrands(dto.orderedIds));
    } catch (error) {
      throw reorderErrorToHttp(error);
    }

    this.logger.info(
      { event: 'device-brand.reorder', orderedIds: dto.orderedIds, actorId },
      'Device brands reordered',
    );

    // The reorder always answers with the COMPLETE list, so its `meta` is the unpaginated
    // one — shape parity with `getBrandsWithCount`, which the panel relies on when it writes
    // this response straight into the list query's cache.
    return {
      data: brands.map((r) => DeviceBrandEntity.fromPrisma(r.brand, r.modelCount)),
      meta: this.buildOptionalMeta(total),
    };
  }

  /** Toggle a brand's visibility (admin). */
  async setBrandActive(id: string, isActive: boolean): Promise<DeviceBrandEntity> {
    const brand = await this.deviceRepository.findBrandById(id);
    if (!brand) {
      throw new NotFoundException('Device brand not found');
    }
    const updated = await this.deviceRepository.updateBrand(id, { isActive });
    return DeviceBrandEntity.fromPrisma(updated);
  }

  // ─── Device models ────────────────────────────────────────────────────────

  /** Public — list active device models (optionally scoped to a brand/search). */
  async getModels(query: DeviceModelListQueryDto): Promise<DeviceModelListResponse> {
    const params: FindModelsParams = {
      page: 1,
      limit: query.limit ?? 200,
      deviceBrandId: query.deviceBrandId,
      search: query.search,
      isActive: true,
    };
    const { models } = await this.deviceRepository.findModels(params);
    return { data: models.map((m) => DeviceModelEntity.fromPrisma(m)) };
  }

  /** Admin — paginated device model list across all statuses (or an explicit filter). */
  async getModelsPaginated(query: DeviceModelListQueryDto): Promise<PaginatedDeviceModelsResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { models, total } = await this.deviceRepository.findModels({
      page,
      limit,
      deviceBrandId: query.deviceBrandId,
      search: query.search,
      isActive: query.isActive,
    });
    return {
      data: models.map((m) => DeviceModelEntity.fromPrisma(m)),
      meta: this.buildMeta(total, page, limit),
    };
  }

  async findModelById(id: string): Promise<DeviceModelEntity> {
    const model = await this.deviceRepository.findModelById(id);
    if (!model) {
      throw new NotFoundException('Device model not found');
    }
    return DeviceModelEntity.fromPrisma(model);
  }

  async createModel(input: CreateDeviceModelInput): Promise<DeviceModelEntity> {
    // Validate the owning brand exists.
    const brand = await this.deviceRepository.findBrandById(input.deviceBrandId);
    if (!brand) {
      throw new NotFoundException('Device brand not found');
    }
    const slug = input.slug ?? generateSlug(input.name);
    const existing = await this.deviceRepository.findModelBySlug(slug);
    if (existing) {
      throw new ConflictException('A device model with this slug already exists');
    }
    const model = await this.deviceRepository.createModel({ ...input, slug });
    const withBrand = await this.deviceRepository.findModelById(model.id);
    return DeviceModelEntity.fromPrisma(withBrand ?? model);
  }

  async updateModel(id: string, input: UpdateDeviceModelInput): Promise<DeviceModelEntity> {
    const model = await this.deviceRepository.findModelById(id);
    if (!model) {
      throw new NotFoundException('Device model not found');
    }
    if (input.deviceBrandId !== undefined && input.deviceBrandId !== model.deviceBrandId) {
      const brand = await this.deviceRepository.findBrandById(input.deviceBrandId);
      if (!brand) {
        throw new NotFoundException('Device brand not found');
      }
    }
    if (input.slug !== undefined && input.slug !== model.slug) {
      const existing = await this.deviceRepository.findModelBySlug(input.slug);
      if (existing && existing.id !== id) {
        throw new ConflictException('A device model with this slug already exists');
      }
    }
    await this.deviceRepository.updateModel(id, input);
    const withBrand = await this.deviceRepository.findModelById(id);
    return DeviceModelEntity.fromPrisma(withBrand!);
  }

  /** Toggle a model's visibility (admin). */
  async setModelActive(id: string, isActive: boolean): Promise<DeviceModelEntity> {
    const model = await this.deviceRepository.findModelById(id);
    if (!model) {
      throw new NotFoundException('Device model not found');
    }
    await this.deviceRepository.updateModel(id, { isActive });
    const withBrand = await this.deviceRepository.findModelById(id);
    return DeviceModelEntity.fromPrisma(withBrand!);
  }

  private buildMeta(total: number, page: number, limit: number): PaginationMeta {
    return { total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Metadata for a list whose pagination is OPT-IN (TASK-357). With no `limit` the
   * whole list came back in one response, so it is reported as a single page of size
   * `total` rather than inventing a page size the caller never asked for. An EMPTY
   * unpaginated list makes that size 0, so `totalPages` is short-circuited instead of
   * dividing by zero.
   */
  private buildOptionalMeta(total: number, page?: number, limit?: number): PaginationMeta {
    const effectiveLimit = limit ?? total;

    return {
      total,
      page: page ?? 1,
      limit: effectiveLimit,
      totalPages: effectiveLimit === 0 ? 0 : Math.ceil(total / effectiveLimit),
    };
  }
}
