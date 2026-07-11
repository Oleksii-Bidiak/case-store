import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AddonDeltaType } from '@prisma/client';
import {
  AddonServiceRepository,
  CreateAddonServiceInput,
  FindAllAdminParams,
  UpdateAddonServiceInput,
} from './addon-service.repository';
import { AddonApplicabilityResolver } from './addon-applicability.resolver';
import {
  AddonServiceDeltaEntity,
  AddonServiceEntity,
  ResolvedAddonEntity,
  ResolvedCategoryTemplateEntity,
} from './entities';
import {
  AddonServiceListQueryDto,
  CreateAddonServiceDto,
  SetCategoryTemplateDto,
  SetProductDeltaDto,
  UpdateAddonServiceDto,
} from './dto';
import { CategoryRepository } from '../category';
import { ProductRepository } from '../product';
import { toTwoDecimals } from './money.util';

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface PaginatedAddonServicesResponse {
  data: AddonServiceEntity[];
  meta: PaginationMeta;
}

/**
 * Business logic for add-on services (TASK-174).
 *
 * Thin over the repository for catalog CRUD (mirrors `BrandService`), plus the
 * template/delta write paths and the read views that the storefront and both
 * admin panels consume. All applicability logic — inheritance, deltas — lives in
 * {@link AddonApplicabilityResolver}, never here.
 */
@Injectable()
export class AddonServiceService {
  constructor(
    private readonly addonServiceRepository: AddonServiceRepository,
    private readonly resolver: AddonApplicabilityResolver,
    private readonly categoryRepository: CategoryRepository,
    private readonly productRepository: ProductRepository,
  ) {}

  // ─── Catalog CRUD ─────────────────────────────────────────────────────────

  /** All active services — backs the admin template/exclusive pickers. */
  async findAllActive(): Promise<{ data: AddonServiceEntity[] }> {
    const services = await this.addonServiceRepository.findAllActive();
    return { data: services.map((service) => AddonServiceEntity.fromPrisma(service)) };
  }

  async findAllAdmin(query: AddonServiceListQueryDto): Promise<PaginatedAddonServicesResponse> {
    const params: FindAllAdminParams = {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      isActive: query.isActive,
      search: query.search,
    };

    const { addonServices, total } = await this.addonServiceRepository.findAllAdmin(params);

    return {
      data: addonServices.map((service) => AddonServiceEntity.fromPrisma(service)),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async findById(id: string): Promise<AddonServiceEntity> {
    const service = await this.addonServiceRepository.findById(id);
    if (!service) throw new NotFoundException('Add-on service not found');
    return AddonServiceEntity.fromPrisma(service);
  }

  async create(dto: CreateAddonServiceDto): Promise<AddonServiceEntity> {
    const input: CreateAddonServiceInput = {
      name: dto.name,
      description: dto.description ?? null,
      price: toTwoDecimals(dto.price),
      isActive: dto.isActive,
    };
    const service = await this.addonServiceRepository.create(input);
    return AddonServiceEntity.fromPrisma(service);
  }

  async update(id: string, dto: UpdateAddonServiceDto): Promise<AddonServiceEntity> {
    await this.findById(id);

    const input: UpdateAddonServiceInput = {
      name: dto.name,
      description: dto.description,
      price: dto.price === undefined ? undefined : toTwoDecimals(dto.price),
      isActive: dto.isActive,
    };
    const service = await this.addonServiceRepository.update(id, input);
    return AddonServiceEntity.fromPrisma(service);
  }

  /**
   * Toggle a service's availability. Reversible: no `deletedAt` tombstone —
   * add-on services are admin content, not audit-tracked user data (same call as
   * `Brand`).
   */
  async setActive(id: string, isActive: boolean): Promise<AddonServiceEntity> {
    await this.findById(id);
    const service = await this.addonServiceRepository.setActive(id, isActive);
    return AddonServiceEntity.fromPrisma(service);
  }

  // ─── Applicability read views ─────────────────────────────────────────────

  /**
   * The add-ons that apply to one product, fully resolved. Backs the admin
   * product-delta panel and a PDP-side preview; the storefront cart gets the
   * same data batched inside `GET /cart`, not from here.
   */
  async resolveForProduct(productId: string): Promise<ResolvedAddonEntity[]> {
    const product = await this.productRepository.findById(productId);
    if (!product || product.deletedAt) throw new NotFoundException('Product not found');

    const addons = await this.resolver.resolveForProduct({
      id: product.id,
      categoryId: product.categoryId,
    });
    return addons.map((addon) => ResolvedAddonEntity.fromResolved(addon));
  }

  // ─── Category templates ───────────────────────────────────────────────────

  /**
   * Where a category's template comes from (own / inherited / none) and what it
   * resolves to — the category form's inheritance affordance.
   */
  async resolveTemplateForCategory(categoryId: string): Promise<ResolvedCategoryTemplateEntity> {
    const category = await this.categoryRepository.findById(categoryId);
    if (!category) throw new NotFoundException('Category not found');

    const resolved = await this.resolver.resolveTemplateForCategory(categoryId);

    const sourceCategory =
      resolved.sourceCategoryId === null
        ? null
        : resolved.sourceCategoryId === categoryId
          ? category
          : await this.categoryRepository.findById(resolved.sourceCategoryId);

    return ResolvedCategoryTemplateEntity.fromResolved(resolved, sourceCategory?.name ?? null);
  }

  /**
   * The services a category declares in its OWN template (no inheritance) — the
   * current value of the admin multi-select.
   */
  async findCategoryTemplate(categoryId: string): Promise<{ addonServiceIds: string[] }> {
    const category = await this.categoryRepository.findById(categoryId);
    if (!category) throw new NotFoundException('Category not found');

    const rows = await this.addonServiceRepository.findCategoryTemplateRows(categoryId);
    return { addonServiceIds: rows.map((row) => row.addonServiceId) };
  }

  /**
   * Full-replace a category's own template. An empty list is valid and means
   * "clear the own template, fall back to inheritance" — it is NOT a no-op.
   */
  async setCategoryTemplate(
    categoryId: string,
    dto: SetCategoryTemplateDto,
  ): Promise<{ addonServiceIds: string[] }> {
    const category = await this.categoryRepository.findById(categoryId);
    if (!category) throw new NotFoundException('Category not found');

    await this.assertServicesExist(dto.addonServiceIds);
    await this.addonServiceRepository.replaceCategoryTemplate(categoryId, dto.addonServiceIds);

    return this.findCategoryTemplate(categoryId);
  }

  // ─── Product deltas ───────────────────────────────────────────────────────

  /** The delta rows declared on one product (admin panel read). */
  async findProductDeltas(productId: string): Promise<AddonServiceDeltaEntity[]> {
    const product = await this.productRepository.findById(productId);
    if (!product || product.deletedAt) throw new NotFoundException('Product not found');

    const rows = await this.addonServiceRepository.findProductDeltaRows(productId);
    return rows.map((row) => AddonServiceDeltaEntity.fromRow(row));
  }

  /**
   * Upsert ONE delta. `price` semantics are enforced by `SetProductDeltaDto`
   * (required for OVERRIDE, optional for ADD, forbidden for REMOVE) — the service
   * only normalises it to the stored two-decimal string.
   */
  async setProductDelta(
    productId: string,
    addonServiceId: string,
    dto: SetProductDeltaDto,
  ): Promise<AddonServiceDeltaEntity> {
    const product = await this.productRepository.findById(productId);
    if (!product || product.deletedAt) throw new NotFoundException('Product not found');

    const service = await this.addonServiceRepository.findById(addonServiceId);
    if (!service) throw new NotFoundException('Add-on service not found');

    const price =
      dto.type === AddonDeltaType.REMOVE || dto.price === undefined || dto.price === null
        ? null
        : toTwoDecimals(dto.price);

    const row = await this.addonServiceRepository.upsertProductDelta(
      productId,
      addonServiceId,
      dto.type,
      price,
    );
    return AddonServiceDeltaEntity.fromRow(row);
  }

  /**
   * Clear a delta — reverting the product to PURE inheritance for that service.
   * Idempotent: clearing a delta that does not exist is a no-op, not a 404.
   */
  async clearProductDelta(productId: string, addonServiceId: string): Promise<void> {
    const product = await this.productRepository.findById(productId);
    if (!product || product.deletedAt) throw new NotFoundException('Product not found');

    await this.addonServiceRepository.clearProductDelta(productId, addonServiceId);
  }

  /**
   * Reject a template that references an unknown service before writing any row —
   * validate-before-write, so a typo'd id can never half-apply.
   */
  private async assertServicesExist(addonServiceIds: string[]): Promise<void> {
    for (const id of new Set(addonServiceIds)) {
      const service = await this.addonServiceRepository.findById(id);
      if (!service) {
        throw new BadRequestException(`Unknown add-on service: ${id}`);
      }
    }
  }
}
