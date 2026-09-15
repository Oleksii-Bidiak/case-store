import { Injectable } from '@nestjs/common';
import { AttributeType, CatalogImportRun, CatalogImportStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { COLOR_SPEC_KEY, COLOR_SPEC_LABEL } from '../common/color-axis';
import type { CurrentProductSnapshot, ImportedFingerprint, LedgerEntry } from './catalog-plan';

/**
 * The key under which a resolved device model is filed while an import runs
 * (TASK-705).
 *
 * Brand id AND model name, because the same model name under two brands has to
 * stay two rows. It is a function rather than a template literal spelled at
 * each site precisely because the writer here and the reader in
 * `CatalogImportService.writeCompat` had drifted: the writer's separator was a
 * literal NUL byte, the reader's a space, so `get()` never matched, every
 * product's compatibility list came out empty, and `setDeviceCompat` — which
 * deletes before it writes — wiped the rows the catalogue already had. Git
 * rendered the file as binary because of those bytes, which is why no diff ever
 * showed it.
 */
export function deviceModelKey(deviceBrandId: string, modelName: string): string {
  return `${deviceBrandId} ${modelName}`;
}

/** De-duplicated, Ukrainian-collated option list for a SELECT definition. */
function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'uk'));
}

/** Fields needed to create a run row once its plan has been computed. */
export interface CreateRunInput {
  filename: string;
  fileHash: string;
  storedPath: string;
  totalRows: number;
  createCount: number;
  updateCount: number;
  missingCount: number;
  errorCount: number;
  plan: Prisma.InputJsonValue;
  actorId: string | null;
  actorEmail: string | null;
}

/** One ledger write after a row has been applied. */
export interface LedgerWrite {
  sourceSku: string;
  productId: string;
  lastImported: ImportedFingerprint;
  lastSeenRunId: string;
}

/**
 * All database access for the catalogue import (TASK-360).
 *
 * Reads are deliberately BULK: a dry run touches every article the ledger knows
 * about, and doing that one row at a time would turn a 1300-row preview into
 * 1300 round trips.
 */
@Injectable()
export class CatalogImportRepository {
  constructor(private readonly prisma: PrismaService) {}

  createRun(data: CreateRunInput): Promise<CatalogImportRun> {
    return this.prisma.catalogImportRun.create({ data });
  }

  findRun(id: string): Promise<CatalogImportRun | null> {
    return this.prisma.catalogImportRun.findUnique({ where: { id } });
  }

  listRuns(limit: number): Promise<CatalogImportRun[]> {
    return this.prisma.catalogImportRun.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
    });
  }

  /** Find a run already parsed from identical bytes, so the UI can say so. */
  findRunByHash(fileHash: string): Promise<CatalogImportRun | null> {
    return this.prisma.catalogImportRun.findFirst({
      where: { fileHash, status: CatalogImportStatus.APPLIED },
      orderBy: { createdAt: 'desc' },
    });
  }

  updateRun(id: string, data: Prisma.CatalogImportRunUpdateInput): Promise<CatalogImportRun> {
    return this.prisma.catalogImportRun.update({ where: { id }, data });
  }

  /**
   * Claim the oldest run awaiting work, if any. Used by the worker tick.
   *
   * `APPLYING` is set by the confirm endpoint, not here: the operator's click is
   * what authorises the write, and the worker only ever picks up what has
   * already been authorised.
   */
  findNextApplying(): Promise<CatalogImportRun | null> {
    return this.prisma.catalogImportRun.findFirst({
      where: { status: CatalogImportStatus.APPLYING },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** The whole import ledger, keyed by supplier article number. */
  async loadLedger(): Promise<Map<string, LedgerEntry>> {
    const items = await this.prisma.catalogImportItem.findMany({
      select: { sourceSku: true, productId: true, lastImported: true },
    });
    return new Map(
      items.map((item) => [
        item.sourceSku,
        {
          sourceSku: item.sourceSku,
          productId: item.productId,
          lastImported: item.lastImported as unknown as ImportedFingerprint,
        },
      ]),
    );
  }

  /**
   * Current state of the products the ledger points at, in the exact shape the
   * diff compares against. Soft-deleted rows are excluded, so a tombstoned
   * product reads as "gone" and its article is planned as a fresh create.
   */
  async loadCurrentProducts(productIds: string[]): Promise<Map<string, CurrentProductSnapshot>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        sku: true,
        isActive: true,
        attributes: true,
        brand: { select: { name: true } },
        category: { select: { name: true } },
      },
    });

    return new Map(
      products.map((product) => {
        const attributes = (product.attributes ?? {}) as Record<string, unknown>;
        const design = attributes.color;
        return [
          product.id,
          {
            id: product.id,
            name: product.name,
            slug: product.slug,
            description: product.description,
            price: product.price.toString(),
            sku: product.sku,
            brandName: product.brand?.name ?? null,
            categoryName: product.category.name,
            design: typeof design === 'string' ? design : null,
            isActive: product.isActive,
          },
        ];
      }),
    );
  }

  /** Upsert one ledger row after its product has been written. */
  recordImported(write: LedgerWrite): Promise<unknown> {
    const shared = {
      productId: write.productId,
      lastImported: write.lastImported as unknown as Prisma.InputJsonValue,
      lastSeenRunId: write.lastSeenRunId,
      // Seeing the article again clears any earlier "gone from the file" mark.
      missingSinceRunId: null,
    };
    return this.prisma.catalogImportItem.upsert({
      where: { sourceSku: write.sourceSku },
      create: { sourceSku: write.sourceSku, ...shared },
      update: shared,
    });
  }

  /** Mark an article as no longer present in the source file. */
  markMissing(sourceSku: string, runId: string): Promise<unknown> {
    return this.prisma.catalogImportItem.update({
      where: { sourceSku },
      data: { missingSinceRunId: runId },
    });
  }

  // ─── Reference data the import creates on demand ──────────────────────────

  /**
   * Resolve category names to ids, creating any that do not exist.
   *
   * Created flat (no parent) and ACTIVE: the supplier's fifteen headings are a
   * usable first taxonomy, and an operator can re-parent them in the category
   * tree afterwards. Matching is by slug, so re-running the import reuses the
   * category an operator may have since renamed.
   */
  async ensureCategories(
    entries: Array<{ name: string; slug: string }>,
  ): Promise<Map<string, string>> {
    const byName = new Map<string, string>();
    for (const entry of entries) {
      const category = await this.prisma.category.upsert({
        where: { slug: entry.slug },
        create: { name: entry.name, slug: entry.slug, isActive: true },
        update: {},
        select: { id: true },
      });
      byName.set(entry.name, category.id);
    }
    return byName;
  }

  /** Resolve brand names to ids, creating any that do not exist. */
  async ensureBrands(entries: Array<{ name: string; slug: string }>): Promise<Map<string, string>> {
    const byName = new Map<string, string>();
    for (const entry of entries) {
      const brand = await this.prisma.brand.upsert({
        where: { slug: entry.slug },
        create: { name: entry.name, slug: entry.slug, isActive: true },
        update: {},
        select: { id: true },
      });
      byName.set(entry.name, brand.id);
    }
    return byName;
  }

  /** Resolve device-brand names to ids, creating any that do not exist. */
  async ensureDeviceBrands(
    entries: Array<{ name: string; slug: string }>,
  ): Promise<Map<string, string>> {
    const byName = new Map<string, string>();
    for (const entry of entries) {
      const brand = await this.prisma.deviceBrand.upsert({
        where: { slug: entry.slug },
        create: { name: entry.name, slug: entry.slug, isActive: true },
        update: {},
        select: { id: true },
      });
      byName.set(entry.name, brand.id);
    }
    return byName;
  }

  /**
   * Resolve device-model names to ids under their brand, creating as needed.
   * Keyed by {@link deviceModelKey} so the same model name under two brands
   * stays two rows.
   *
   * The key is built by that ONE function and read back by it too
   * (`CatalogImportService.writeCompat`) — never by a second copy of the
   * template. Writing and reading a map key with two different literals is
   * exactly how this silently wrote an empty compatibility list for every
   * imported product (TASK-705).
   */
  async ensureDeviceModels(
    entries: Array<{ name: string; slug: string; deviceBrandId: string }>,
  ): Promise<Map<string, string>> {
    const byKey = new Map<string, string>();
    for (const entry of entries) {
      const model = await this.prisma.deviceModel.upsert({
        where: { slug: entry.slug },
        create: {
          name: entry.name,
          slug: entry.slug,
          deviceBrandId: entry.deviceBrandId,
          isActive: true,
        },
        update: {},
        select: { id: true },
      });
      byKey.set(deviceModelKey(entry.deviceBrandId, entry.name), model.id);
    }
    return byKey;
  }

  /**
   * Resolve attribute definitions for one category, creating any that are
   * missing. Everything is typed TEXT on purpose: the source columns mix
   * "до 20м" with "5" in the same column, so inferring NUMBER would reject real
   * values. An operator promotes the ones worth filtering on afterwards.
   */
  async ensureAttributeDefinitions(
    categoryId: string,
    columns: Array<{ key: string; label: string }>,
  ): Promise<Map<string, string>> {
    const byKey = new Map<string, string>();
    for (const column of columns) {
      const definition = await this.prisma.attributeDefinition.upsert({
        where: { categoryId_key: { categoryId, key: column.key } },
        create: { categoryId, key: column.key, label: column.label },
        update: {},
        select: { id: true },
      });
      byKey.set(column.key, definition.id);
    }
    return byKey;
  }

  /**
   * Resolve (creating if needed) the `color` definition for an imported
   * category, widening its option list to cover the colours this file carries —
   * TASK-487.
   *
   * It does NOT go through {@link ensureAttributeDefinitions}, and the
   * difference is the whole point. That method types every column TEXT and
   * leaves it non-filterable on purpose: the source columns mix "до 20м" with
   * "5", so inferring a type would reject real values, and an operator promotes
   * the ones worth filtering on afterwards. Colour needs neither judgement —
   * it is a closed set of short names and it is the strongest facet in
   * accessories (owner decision B-10) — and a TEXT definition is never offered
   * as a facet at all, so leaving colour to the default meant importing a
   * catalogue with colours nobody could filter by.
   *
   * Options are MERGED, never replaced: the admin spec editor renders a SELECT
   * as a closed dropdown, and a later file listing fewer colours must not make
   * the earlier ones unpickable.
   */
  async ensureColorDefinition(categoryId: string, colors: string[]): Promise<string> {
    const wanted = colors.map((color) => color.trim()).filter((color) => color !== '');

    const existing = await this.prisma.attributeDefinition.findUnique({
      where: { categoryId_key: { categoryId, key: COLOR_SPEC_KEY } },
      select: { id: true, options: true },
    });

    if (!existing) {
      const created = await this.prisma.attributeDefinition.create({
        data: {
          categoryId,
          key: COLOR_SPEC_KEY,
          label: COLOR_SPEC_LABEL,
          type: AttributeType.SELECT,
          options: sortedUnique(wanted),
          isFilterable: true,
        },
        select: { id: true },
      });
      return created.id;
    }

    const current = Array.isArray(existing.options)
      ? (existing.options as unknown[]).filter(
          (option): option is string => typeof option === 'string',
        )
      : [];
    const merged = sortedUnique([...current, ...wanted]);

    await this.prisma.attributeDefinition.update({
      where: { id: existing.id },
      data: {
        type: AttributeType.SELECT,
        isFilterable: true,
        options: merged,
      },
    });
    return existing.id;
  }

  /**
   * Resolve a variant group by name, creating it with a single colour axis.
   *
   * The axis is named `color` here while the seed names it «Колір» — both are
   * accepted everywhere, because `common/color-axis.ts` owns the list and every
   * reader goes through it (TASK-487). Do not "unify" the two by renaming this
   * one: groups created by earlier imports are already on disk with `color`, and
   * a rename would orphan their positions' `attributes` keys.
   */
  async ensureGroup(name: string): Promise<string> {
    const existing = await this.prisma.productGroup.findFirst({
      where: { name },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }
    const group = await this.prisma.productGroup.create({
      data: { name, axes: { create: [{ name: 'color', sortOrder: 0 }] } },
      select: { id: true },
    });
    return group.id;
  }

  /** Replace a product's structured spec values in one transaction. */
  async setSpecValues(
    productId: string,
    values: Array<{ definitionId: string; value: string }>,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.productAttributeValue.deleteMany({ where: { productId } }),
      ...(values.length > 0
        ? [
            this.prisma.productAttributeValue.createMany({
              data: values.map((value) => ({ productId, ...value })),
            }),
          ]
        : []),
    ]);
  }

  /** Replace a product's device-compatibility set in one transaction. */
  async setDeviceCompat(productId: string, deviceModelIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.productDeviceCompat.deleteMany({ where: { productId } }),
      ...(deviceModelIds.length > 0
        ? [
            this.prisma.productDeviceCompat.createMany({
              data: deviceModelIds.map((deviceModelId) => ({ productId, deviceModelId })),
            }),
          ]
        : []),
    ]);
  }
}
