import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { DeviceBrand, DeviceModel, Prisma, SlugRedirectEntity } from '@prisma/client';
import { ReorderTx, acquireAdvisoryLocks, lockKey, reorderBucket } from '../common/reorder';
import { SlugRedirectRepository } from '../slug-redirect';
// eslint-disable-next-line local/no-deep-module-import -- cycle: product barrel > product.module > device barrel > this file
import { publicProductSql } from '../product/product-visibility';

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
  /** Compatibility-landing copy overrides (TASK-490); absent/null = generated. */
  metaTitle?: string | null;
  metaDescription?: string | null;
  description?: string | null;
}

/** Allowed fields for updating a device model. */
export interface UpdateDeviceModelInput {
  deviceBrandId?: string;
  name?: string;
  slug?: string;
  series?: string | null;
  releaseYear?: number | null;
  isActive?: boolean;
  /** Compatibility-landing copy overrides (TASK-490); explicit null clears one. */
  metaTitle?: string | null;
  metaDescription?: string | null;
  description?: string | null;
}

/**
 * Slugs of a model rename being persisted by `updateModel` (TASK-699). When present
 * the write also records `oldSlug → newSlug` in the SlugRedirect ledger under
 * `DEVICE_MODEL`, atomically with the model update — so the public compatibility
 * landing `/catalog/<категорія>/<стара-модель>` answers 308 instead of 404. The
 * service passes it only when the model was active before the write (plan 147
 * §Design Decision 3, the same rule as a category rename).
 */
export interface DeviceModelSlugRename {
  oldSlug: string;
  newSlug: string;
}

/**
 * Orders of the PUBLIC device-model list (TASK-1952 / TASK-2070). `undefined`
 * keeps the historical order — the one the admin list uses too.
 */
export type PublicModelSort = 'name' | 'popular';

/**
 * Parameters of the PUBLIC device-model list (TASK-702). No `isActive` on
 * purpose: the public read is active-only by construction, not by a flag a
 * caller could forget. No `page` either — the storefront reads one bounded slice.
 */
export interface FindPublicModelsParams {
  limit?: number;
  deviceBrandId?: string;
  search?: string;
  sort?: PublicModelSort;
}

/**
 * One row of the public device-model list — mirrors `DeviceModelListItemEntity`.
 * The landing SEO copy (`metaTitle`/`metaDescription`/`description`) is never
 * even read.
 */
export interface PublicDeviceModelRow {
  id: string;
  deviceBrandId: string;
  name: string;
  slug: string;
  series: string | null;
  releaseYear: number | null;
  brandName: string;
  brandSlug: string;
  /** Compatible publicly visible products (PUBLIC_PRODUCT_WHERE), 0 when none. */
  productCount: number;
}

/**
 * ORDER BY per public sort. Constant fragments only — the caller's `sort` picks
 * a key, it is never spliced. `dm.id` closes every order so equal rows cannot
 * swap places between two reads of a cached page.
 *
 * The default mirrors {@link MODEL_LIST_ORDER} as Prisma compiles it: a bare
 * `DESC`, which in Postgres puts a NULL release year first.
 */
const PUBLIC_MODEL_ORDER_SQL: Record<PublicModelSort | 'default', Prisma.Sql> = {
  default: Prisma.sql`ORDER BY dm.release_year DESC, dm.name ASC, dm.id ASC`,
  name: Prisma.sql`ORDER BY dm.name ASC, dm.id ASC`,
  popular: Prisma.sql`ORDER BY "productCount" DESC, dm.name ASC, dm.id ASC`,
};

/**
 * Escape LIKE wildcards (and the escape character itself) so a search for `50%`
 * or `a_b` matches literally — Postgres' default LIKE escape is the backslash.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/** Newest first, then by name — shared by the admin and the public model lists. */
const MODEL_LIST_ORDER: Prisma.DeviceModelOrderByWithRelationInput[] = [
  { releaseYear: 'desc' },
  { name: 'asc' },
];

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly slugRedirectRepository: SlugRedirectRepository,
  ) {}

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
    const { page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;
    const where = this.buildModelWhere(params);

    const [models, total] = await Promise.all([
      this.prisma.deviceModel.findMany({
        where,
        skip,
        take: limit,
        orderBy: MODEL_LIST_ORDER,
        include: { brand: { select: { name: true } } },
      }),
      this.prisma.deviceModel.count({ where }),
    ]);

    return { models, total };
  }

  /**
   * The PUBLIC device-model list (TASK-702, widened by TASK-1952 / TASK-2070):
   * active models only, the light column set plus the owning brand's name/slug
   * and the number of compatible publicly visible products.
   *
   * ONE statement, whatever the sort: the per-model product count is a single
   * `GROUP BY` over the compat table joined in, never a query per model. It is
   * raw SQL because Prisma can neither order by a FILTERED relation count
   * (`orderBy: { compat: { _count } }` counts hidden products too) nor return
   * one alongside a sort on it. The visibility half is not restated by hand —
   * it is {@link publicProductSql}, the SQL twin of `PUBLIC_PRODUCT_WHERE`, the
   * same one the compat landing pages count with, so «N товарів» on a picker
   * tile and on the landing page cannot disagree.
   *
   * The model filters mirror {@link buildModelWhere} for the public case
   * (`is_active`, brand, case-insensitive name `contains`); the unit spec pins
   * them. The device BRAND's own `is_active` is deliberately not consulted —
   * the list never filtered on it, and the landing pages do not either.
   */
  async findPublicModels(params: FindPublicModelsParams): Promise<PublicDeviceModelRow[]> {
    const { limit = 50, deviceBrandId, search, sort } = params;

    const conditions: Prisma.Sql[] = [Prisma.sql`dm.is_active = true`];
    if (deviceBrandId) {
      conditions.push(Prisma.sql`dm.device_brand_id = ${deviceBrandId}`);
    }
    if (search) {
      conditions.push(Prisma.sql`dm.name ILIKE ${`%${escapeLikePattern(search)}%`}`);
    }

    const rows = await this.prisma.$queryRaw<
      Array<Omit<PublicDeviceModelRow, 'productCount'> & { productCount: number | bigint }>
    >(Prisma.sql`
      SELECT dm.id,
             dm.device_brand_id AS "deviceBrandId",
             dm.name,
             dm.slug,
             dm.series,
             dm.release_year AS "releaseYear",
             db.name AS "brandName",
             db.slug AS "brandSlug",
             COALESCE(pc.product_count, 0)::int AS "productCount"
      FROM device_models dm
      JOIN device_brands db ON db.id = dm.device_brand_id
      LEFT JOIN (
        SELECT pdc.device_model_id, COUNT(*)::int AS product_count
        FROM product_device_compat pdc
        JOIN products p ON p.id = pdc.product_id
        JOIN categories c ON c.id = p.category_id
        WHERE ${publicProductSql({ product: 'p', category: 'c' })}
        GROUP BY pdc.device_model_id
      ) pc ON pc.device_model_id = dm.id
      WHERE ${Prisma.join(conditions, ' AND ')}
      ${PUBLIC_MODEL_ORDER_SQL[sort ?? 'default']}
      LIMIT ${limit}
    `);

    return rows.map((row) => ({ ...row, productCount: Number(row.productCount) }));
  }

  /** One where-clause for both model lists, so their filters cannot drift apart. */
  private buildModelWhere(
    params: Pick<FindModelsParams, 'deviceBrandId' | 'series' | 'search' | 'isActive'>,
  ): Prisma.DeviceModelWhereInput {
    const { deviceBrandId, series, search, isActive } = params;
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
    return where;
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
        // TASK-490 — landing-page copy overrides; `?? null` keeps "not provided"
        // and "explicitly cleared" the same thing on CREATE.
        metaTitle: data.metaTitle ?? null,
        metaDescription: data.metaDescription ?? null,
        description: data.description ?? null,
      },
    });
  }

  /**
   * Update a device model. With `slugRename` the update and the `DEVICE_MODEL`
   * redirect-ledger write commit or roll back together (TASK-699) — a rename that
   * fails on the unique slug must never leave a redirect to a slug no model holds.
   * Without it this stays one plain write.
   */
  updateModel(
    id: string,
    data: UpdateDeviceModelInput,
    slugRename?: DeviceModelSlugRename,
  ): Promise<DeviceModel> {
    if (!slugRename) {
      return this.prisma.deviceModel.update({ where: { id }, data });
    }
    return this.prisma.$transaction(async (tx) => {
      const model = await tx.deviceModel.update({ where: { id }, data });
      await this.slugRedirectRepository.recordRename(
        tx,
        SlugRedirectEntity.DEVICE_MODEL,
        slugRename.oldSlug,
        slugRename.newSlug,
      );
      return model;
    });
  }
}
