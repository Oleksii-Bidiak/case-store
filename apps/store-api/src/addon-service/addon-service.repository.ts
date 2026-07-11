import { Injectable } from '@nestjs/common';
import { AddonDeltaType, AddonService, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import type { CategoryTemplateRow, ProductDeltaRow } from './addon-service.types';

/**
 * Parameters for the paginated admin add-on-service list.
 */
export interface FindAllAdminParams {
  page: number;
  limit: number;
  isActive?: boolean;
  search?: string;
}

/**
 * Allowed fields for creating an add-on service.
 */
export interface CreateAddonServiceInput {
  name: string;
  description?: string | null;
  price: string;
  isActive?: boolean;
}

/**
 * Allowed fields for updating an add-on service. Only provided fields are written.
 */
export interface UpdateAddonServiceInput {
  name?: string;
  description?: string | null;
  price?: string;
  isActive?: boolean;
}

export interface PaginatedAddonServicesResult {
  addonServices: AddonService[];
  total: number;
}

/**
 * A product delta row as read back for the admin form (joined service included).
 */
export type AddonServiceDeltaRow = ProductDeltaRow & {
  id: string;
};

/** The catalog columns every resolver/admin read needs from a joined service. */
const ADDON_SERVICE_SELECT = {
  id: true,
  name: true,
  description: true,
  price: true,
  isActive: true,
} as const;

/**
 * Repository encapsulating all Prisma access for the add-on-service feature
 * (TASK-174): the `AddonService` catalog, `CategoryAddonTemplate` membership,
 * and per-product `AddonServiceDelta` rows.
 *
 * Deliberately dumb about applicability — inheritance and delta application live
 * in {@link AddonApplicabilityResolver}. This class only fetches rows; the two
 * batched `*ForCategories` / `*ForProducts` reads exist so the resolver can stay
 * bounded at three queries for a whole cart (no N+1).
 */
@Injectable()
export class AddonServiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Catalog CRUD ─────────────────────────────────────────────────────────

  findById(id: string): Promise<AddonService | null> {
    return this.prisma.addonService.findUnique({ where: { id } });
  }

  /**
   * All active services, ordered by name — backs the admin pickers (category
   * template multi-select, product-exclusive ADD picker).
   */
  findAllActive(): Promise<AddonService[]> {
    return this.prisma.addonService.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Paginated admin listing (all statuses) with optional status filter + search.
   */
  async findAllAdmin(params: FindAllAdminParams): Promise<PaginatedAddonServicesResult> {
    const { page, limit, isActive, search } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.AddonServiceWhereInput = {};
    if (isActive !== undefined) where.isActive = isActive;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const [addonServices, total] = await Promise.all([
      this.prisma.addonService.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
      this.prisma.addonService.count({ where }),
    ]);

    return { addonServices, total };
  }

  create(data: CreateAddonServiceInput): Promise<AddonService> {
    return this.prisma.addonService.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        price: data.price,
        isActive: data.isActive ?? true,
      },
    });
  }

  update(id: string, data: UpdateAddonServiceInput): Promise<AddonService> {
    return this.prisma.addonService.update({ where: { id }, data });
  }

  setActive(id: string, isActive: boolean): Promise<AddonService> {
    return this.prisma.addonService.update({ where: { id }, data: { isActive } });
  }

  // ─── Category templates ───────────────────────────────────────────────────

  /**
   * The template rows a category declares ITSELF — no inheritance (that is the
   * resolver's job). Backs the admin category-form multi-select's current value.
   */
  findCategoryTemplateRows(categoryId: string): Promise<CategoryTemplateRow[]> {
    return this.prisma.categoryAddonTemplate.findMany({
      where: { categoryId },
      select: {
        categoryId: true,
        addonServiceId: true,
        addonService: { select: ADDON_SERVICE_SELECT },
      },
      orderBy: { addonService: { name: 'asc' } },
    });
  }

  /**
   * Batched sibling of {@link findCategoryTemplateRows} — one query for every
   * category in an ancestor chain (or in many chains at once). The resolver then
   * picks the nearest chain member that has any rows.
   */
  findTemplateRowsForCategories(categoryIds: string[]): Promise<CategoryTemplateRow[]> {
    if (categoryIds.length === 0) return Promise.resolve([]);
    return this.prisma.categoryAddonTemplate.findMany({
      where: { categoryId: { in: categoryIds } },
      select: {
        categoryId: true,
        addonServiceId: true,
        addonService: { select: ADDON_SERVICE_SELECT },
      },
      orderBy: { addonService: { name: 'asc' } },
    });
  }

  /**
   * Full-replace a category's OWN template in one transaction: delete the rows
   * that are gone, insert the ones that are new, leave the unchanged ones alone
   * (so `createdAt` survives a no-op save). An empty `addonServiceIds` clears the
   * category's own template entirely, restoring pure inheritance from its
   * nearest ancestor.
   */
  async replaceCategoryTemplate(categoryId: string, addonServiceIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.categoryAddonTemplate.findMany({
        where: { categoryId },
        select: { addonServiceId: true },
      });
      const existingIds = new Set(existing.map((row) => row.addonServiceId));
      const nextIds = new Set(addonServiceIds);

      const toDelete = [...existingIds].filter((id) => !nextIds.has(id));
      const toCreate = [...nextIds].filter((id) => !existingIds.has(id));

      if (toDelete.length > 0) {
        await tx.categoryAddonTemplate.deleteMany({
          where: { categoryId, addonServiceId: { in: toDelete } },
        });
      }
      if (toCreate.length > 0) {
        await tx.categoryAddonTemplate.createMany({
          data: toCreate.map((addonServiceId) => ({ categoryId, addonServiceId })),
        });
      }
    });
  }

  // ─── Product deltas ───────────────────────────────────────────────────────

  /**
   * The delta rows declared on ONE product. Backs the admin product-delta panel.
   */
  findProductDeltaRows(productId: string): Promise<AddonServiceDeltaRow[]> {
    return this.prisma.addonServiceDelta.findMany({
      where: { productId },
      select: {
        id: true,
        productId: true,
        addonServiceId: true,
        type: true,
        price: true,
        addonService: { select: ADDON_SERVICE_SELECT },
      },
      orderBy: { addonService: { name: 'asc' } },
    });
  }

  /**
   * Batched sibling of {@link findProductDeltaRows} — one query for a whole cart.
   */
  findDeltaRowsForProducts(productIds: string[]): Promise<ProductDeltaRow[]> {
    if (productIds.length === 0) return Promise.resolve([]);
    return this.prisma.addonServiceDelta.findMany({
      where: { productId: { in: productIds } },
      select: {
        productId: true,
        addonServiceId: true,
        type: true,
        price: true,
        addonService: { select: ADDON_SERVICE_SELECT },
      },
    });
  }

  /**
   * Create or update ONE delta row. The `@@unique([productId, addonServiceId])`
   * constraint makes ADD/REMOVE/OVERRIDE mutually exclusive per pair — changing
   * a product's exception for a service rewrites the same row rather than piling
   * up contradictory ones.
   */
  async upsertProductDelta(
    productId: string,
    addonServiceId: string,
    type: AddonDeltaType,
    price: string | null,
  ): Promise<AddonServiceDeltaRow> {
    await this.prisma.addonServiceDelta.upsert({
      where: { productId_addonServiceId: { productId, addonServiceId } },
      update: { type, price },
      create: { productId, addonServiceId, type, price },
    });

    const rows = await this.findProductDeltaRows(productId);
    return rows.find((row) => row.addonServiceId === addonServiceId)!;
  }

  /**
   * Delete a delta row entirely — reverting the product to PURE inheritance for
   * that service. Distinct from a `REMOVE` delta, which is itself a row that
   * exists (and actively suppresses an inherited service). Idempotent.
   */
  async clearProductDelta(productId: string, addonServiceId: string): Promise<void> {
    await this.prisma.addonServiceDelta.deleteMany({ where: { productId, addonServiceId } });
  }
}
