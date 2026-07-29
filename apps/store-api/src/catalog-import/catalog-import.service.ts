import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CatalogImportRun, CatalogImportStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { CatalogImportRepository } from './catalog-import.repository';
import { parseXlsxCatalog } from './xlsx-catalog.parser';
import {
  buildImportPlan,
  fingerprintOf,
  type CatalogImportPlan,
  type ChangeField,
  type PlannedRow,
} from './catalog-plan';
import type { ParsedCatalog, ParsedProductRow } from './catalog-import.types';
import { ProductService } from '../product/product.service';
import { IMPORTS_SUBDIR, IStorageService, STORAGE_SERVICE } from '../storage';
import { generateSlug } from '../common/utils';

/**
 * The operator's review decisions, posted back with the confirmation.
 *
 * Absence means "apply as planned" — the owner's rule is that the file wins by
 * default. `excluded` carries only what they actively unticked, so the payload
 * stays small even for a 1300-row run.
 */
export interface ImportDecisions {
  /** Article numbers to skip entirely. */
  excludedSkus?: string[];
  /** Per-article field names to leave alone, e.g. `{ "A1": ["price"] }`. */
  excludedFields?: Record<string, string[]>;
}

/** How many rows one worker tick writes. Keeps a 1300-row run off the request path. */
export const IMPORT_CHUNK_SIZE = 50;

/** Uploaded workbooks larger than this are rejected before parsing. */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

@Injectable()
export class CatalogImportService {
  private readonly logger = new Logger(CatalogImportService.name);

  constructor(
    private readonly repository: CatalogImportRepository,
    private readonly productService: ProductService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
  ) {}

  /**
   * Parse an uploaded workbook, diff it against the ledger, and store the result
   * as a run awaiting review. NOTHING is written to the catalogue here — this is
   * the dry run.
   */
  async createRun(
    buffer: Buffer,
    filename: string,
    actor: { id: string | null; email: string | null },
  ): Promise<{ run: CatalogImportRun; plan: CatalogImportPlan; duplicateOf: string | null }> {
    if (buffer.length === 0) {
      throw new BadRequestException('Файл порожній.');
    }
    if (buffer.length > MAX_IMPORT_BYTES) {
      throw new BadRequestException(
        `Файл більший за ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} МБ.`,
      );
    }

    let catalog: ParsedCatalog;
    try {
      catalog = await parseXlsxCatalog(buffer, filename);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }

    const plan = await this.planFor(catalog);
    const fileHash = createHash('sha256').update(buffer).digest('hex');
    // Keep the workbook: applying re-reads it for the full values the plan only
    // previews. Saved BEFORE the run row so a run never points at a missing file.
    const storedPath = await this.storage.save(buffer, 'xlsx', IMPORTS_SUBDIR);

    const previous = await this.repository.findRunByHash(fileHash);

    const run = await this.repository.createRun({
      filename,
      fileHash,
      storedPath,
      totalRows: plan.counts.total,
      createCount: plan.counts.create,
      updateCount: plan.counts.update,
      missingCount: plan.counts.missing,
      errorCount: plan.counts.errors,
      plan: plan as unknown as Prisma.InputJsonValue,
      actorId: actor.id,
      actorEmail: actor.email,
    });

    return { run, plan, duplicateOf: previous?.id ?? null };
  }

  /** Re-run the diff for an already-parsed catalogue against the CURRENT database. */
  private async planFor(catalog: ParsedCatalog): Promise<CatalogImportPlan> {
    const ledger = await this.repository.loadLedger();
    const productIds = [...ledger.values()]
      .map((entry) => entry.productId)
      .filter((id): id is string => id !== null);
    const current = await this.repository.loadCurrentProducts(productIds);
    return buildImportPlan(catalog, ledger, current);
  }

  async getRun(id: string): Promise<CatalogImportRun> {
    const run = await this.repository.findRun(id);
    if (!run) {
      throw new NotFoundException('Запуск імпорту не знайдено.');
    }
    return run;
  }

  listRuns(limit: number): Promise<CatalogImportRun[]> {
    return this.repository.listRuns(limit);
  }

  /**
   * Accept the operator's decisions and hand the run to the worker.
   *
   * Only the status transition happens here — the writing itself is chunked
   * across worker ticks, so confirming a 1300-row import returns immediately
   * instead of holding an HTTP request open for minutes.
   */
  async apply(id: string, decisions: ImportDecisions): Promise<CatalogImportRun> {
    const run = await this.getRun(id);
    if (run.status !== CatalogImportStatus.PARSED) {
      throw new ConflictException(
        `Цей запуск уже має статус «${run.status}» — застосувати можна лише щойно розібраний файл.`,
      );
    }
    // Narrow `totalRows` to what this run will ACTUALLY write. The column means
    // "rows this run acts on": at parse time that is the whole plan, and here it
    // becomes the subset the operator authorised. Without this the progress bar
    // divides by the full plan — confirming four rows out of 1297 renders as 0%
    // and looks stuck, which is exactly what it did on the first live run.
    const actionable = this.countActionable(run.plan as unknown as CatalogImportPlan, decisions);

    return this.repository.updateRun(id, {
      status: CatalogImportStatus.APPLYING,
      decisions: decisions as unknown as Prisma.InputJsonValue,
      appliedRows: 0,
      totalRows: actionable,
    });
  }

  /** Rows a run will write: everything that changes, minus what was unticked. */
  private countActionable(plan: CatalogImportPlan, decisions: ImportDecisions): number {
    const excluded = new Set(decisions.excludedSkus ?? []);
    return plan.rows.filter((row) => row.action !== 'unchanged' && !excluded.has(row.sourceSku))
      .length;
  }

  async cancel(id: string): Promise<CatalogImportRun> {
    const run = await this.getRun(id);
    if (run.status !== CatalogImportStatus.PARSED) {
      throw new ConflictException('Скасувати можна лише запуск, який ще не застосовано.');
    }
    const cancelled = await this.repository.updateRun(id, {
      status: CatalogImportStatus.CANCELLED,
    });
    await this.discardWorkbook(run);
    return cancelled;
  }

  /**
   * Delete the uploaded workbook once a run can no longer need it.
   *
   * The file is the supplier's whole catalogue. It is kept only because
   * APPLYING re-reads it for the values the plan deliberately does not copy, so
   * the moment a run reaches a terminal state that reason is gone — and a shop
   * that quietly accumulates its supplier's price list on disk, one copy per
   * upload, is hoarding someone else's data for nothing.
   *
   * Best-effort: a run is not "less finished" because a file could not be
   * removed, and the history row keeps the path for the record either way.
   */
  private async discardWorkbook(run: CatalogImportRun): Promise<void> {
    try {
      await this.storage.delete(run.storedPath);
    } catch (error) {
      this.logger.warn(
        `Could not delete workbook ${run.storedPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Write the next chunk of a run. Called by the worker; returns true while
   * there is more to do.
   *
   * Writes go through {@link ProductService}, never straight to Prisma: cache
   * eviction, the Meilisearch sync and slug-redirect recording all live there,
   * and a bulk path that skipped them would leave the storefront serving stale
   * pages — the exact divergence TASK-293 was bitten by.
   */
  async applyChunk(run: CatalogImportRun): Promise<boolean> {
    const plan = run.plan as unknown as CatalogImportPlan;
    const decisions = (run.decisions ?? {}) as ImportDecisions;
    const excludedSkus = new Set(decisions.excludedSkus ?? []);

    const actionable = plan.rows.filter(
      (row) => row.action !== 'unchanged' && !excludedSkus.has(row.sourceSku),
    );

    const from = run.appliedRows;
    const slice = actionable.slice(from, from + IMPORT_CHUNK_SIZE);
    if (slice.length === 0) {
      await this.repository.updateRun(run.id, {
        status: CatalogImportStatus.APPLIED,
        appliedAt: new Date(),
      });
      await this.discardWorkbook(run);
      return false;
    }

    // The source rows are needed for the FULL values (descriptions, specs) the
    // plan only previews — re-read from the workbook we kept.
    const catalog = await this.readCatalog(run);
    const bySku = new Map(catalog.rows.map((row) => [row.sourceSku, row]));
    const context = await this.resolveReferences(catalog, plan);

    for (const planned of slice) {
      try {
        await this.applyRow(run.id, planned, bySku.get(planned.sourceSku), context, decisions);
      } catch (error) {
        // One bad row must not abandon the other 1299. Log it and carry on; the
        // ledger simply does not learn about this article, so the next import
        // proposes it again.
        this.logger.error(
          `Import ${run.id}: row ${planned.sourceSku} failed — ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    await this.repository.updateRun(run.id, { appliedRows: from + slice.length });
    return true;
  }

  /** Re-read and re-parse the stored workbook for a run. */
  private async readCatalog(run: CatalogImportRun): Promise<ParsedCatalog> {
    const buffer = await this.storage.read(run.storedPath);
    return parseXlsxCatalog(buffer, run.filename);
  }

  /**
   * Create (or find) every category, brand, device and attribute definition the
   * plan references, once per chunk.
   *
   * Doing it per chunk rather than once per run keeps the worker stateless — a
   * restarted API picks a half-applied run straight back up — and the upserts
   * are idempotent, so repeating them costs a few round trips and nothing else.
   */
  private async resolveReferences(catalog: ParsedCatalog, plan: CatalogImportPlan) {
    const categories = await this.repository.ensureCategories(plan.categories);
    const brands = await this.repository.ensureBrands(plan.brands);
    const deviceBrands = await this.repository.ensureDeviceBrands(plan.deviceBrands);

    // Device models are unique per brand, so their slug carries the brand too —
    // "Galaxy A35" under two manufacturers must not collapse into one row.
    const modelEntries = new Map<string, { name: string; slug: string; deviceBrandId: string }>();
    for (const row of catalog.rows) {
      const deviceBrandId = row.deviceBrandName ? deviceBrands.get(row.deviceBrandName) : undefined;
      if (!deviceBrandId) {
        continue;
      }
      for (const modelName of row.deviceModelNames) {
        const key = `${deviceBrandId} ${modelName}`;
        if (!modelEntries.has(key)) {
          modelEntries.set(key, {
            name: modelName,
            slug: generateSlug(`${row.deviceBrandName} ${modelName}`),
            deviceBrandId,
          });
        }
      }
    }
    const deviceModels = await this.repository.ensureDeviceModels([...modelEntries.values()]);

    // Attribute definitions belong to a category, so only create the columns
    // each category's own rows actually use — otherwise every category would
    // inherit all 87 of them, most of them permanently blank.
    const columnsByCategory = new Map<string, Map<string, string>>();
    for (const row of catalog.rows) {
      const existing = columnsByCategory.get(row.categoryName) ?? new Map<string, string>();
      for (const key of Object.keys(row.attributes)) {
        const label = catalog.attributeColumns.find((column) => column.key === key)?.label ?? key;
        existing.set(key, label);
      }
      columnsByCategory.set(row.categoryName, existing);
    }

    const definitions = new Map<string, Map<string, string>>();
    for (const [categoryName, columns] of columnsByCategory) {
      const categoryId = categories.get(categoryName);
      if (!categoryId || columns.size === 0) {
        continue;
      }
      definitions.set(
        categoryName,
        await this.repository.ensureAttributeDefinitions(
          categoryId,
          [...columns.entries()].map(([key, label]) => ({ key, label })),
        ),
      );
    }

    // Variant groups: only names the file uses more than once.
    const groupNames = new Set(plan.groups.map((group) => group.name));
    const groupIdByName = new Map<string, string>();
    for (const name of groupNames) {
      groupIdByName.set(name, await this.repository.ensureGroup(name));
    }
    const groupBySku = new Map<string, string>();
    for (const group of plan.groups) {
      const groupId = groupIdByName.get(group.name);
      if (groupId) {
        for (const sku of group.sourceSkus) {
          groupBySku.set(sku, groupId);
        }
      }
    }

    return { categories, brands, deviceBrands, deviceModels, definitions, groupBySku };
  }

  /** Apply one planned row. */
  private async applyRow(
    runId: string,
    planned: PlannedRow,
    source: ParsedProductRow | undefined,
    context: Awaited<ReturnType<CatalogImportService['resolveReferences']>>,
    decisions: ImportDecisions,
  ): Promise<void> {
    // An article that fell out of the file: hide the product, never delete it.
    // Reversible by design — restoring the row upstream brings it straight back.
    if (planned.action === 'missing') {
      if (planned.productId) {
        await this.productService.deactivate(planned.productId);
        await this.repository.markMissing(planned.sourceSku, runId);
      }
      return;
    }

    if (!source) {
      throw new Error('рядок зник із файлу між переглядом і застосуванням');
    }

    const categoryId = context.categories.get(source.categoryName);
    if (!categoryId) {
      throw new Error(`категорія «${source.categoryName}» не створена`);
    }
    const brandId = source.brandName ? context.brands.get(source.brandName) : undefined;
    const groupId = context.groupBySku.get(source.sourceSku);

    const productId =
      planned.action === 'create'
        ? await this.createProduct(planned, source, categoryId, brandId, groupId)
        : await this.updateProduct(planned, source, categoryId, brandId, decisions);

    if (!productId) {
      return;
    }

    await this.writeSpecs(productId, source, context);
    await this.writeCompat(productId, source, context);

    await this.repository.recordImported({
      sourceSku: source.sourceSku,
      productId,
      lastImported: fingerprintOf(source, planned.slug),
      lastSeenRunId: runId,
    });
  }

  /** Create a product as a hidden draft. */
  private async createProduct(
    planned: PlannedRow,
    source: ParsedProductRow,
    categoryId: string,
    brandId: string | undefined,
    groupId: string | undefined,
  ): Promise<string> {
    const product = await this.productService.create({
      name: source.name,
      slug: planned.slug,
      description: source.description,
      price: source.price,
      sku: source.sourceSku,
      categoryId,
      brandId: brandId ?? null,
      groupId: groupId ?? null,
      attributes: source.design ? { color: source.design } : {},
      // Hidden, and with no stock: the file carries no stock column, and an
      // imported product is a draft until someone has looked at it.
      isActive: false,
    });
    return product.id;
  }

  /** Apply the ticked field changes to an existing product. */
  private async updateProduct(
    planned: PlannedRow,
    source: ParsedProductRow,
    categoryId: string,
    brandId: string | undefined,
    decisions: ImportDecisions,
  ): Promise<string | null> {
    if (!planned.productId) {
      return null;
    }
    const excluded = new Set(decisions.excludedFields?.[planned.sourceSku] ?? []);
    const wanted = (field: ChangeField): boolean =>
      planned.changes.some((change) => change.field === field) && !excluded.has(field);

    const data: Parameters<ProductService['update']>[1] = {};
    if (wanted('name')) data.name = source.name;
    if (wanted('slug')) data.slug = planned.slug;
    if (wanted('description')) data.description = source.description;
    if (wanted('price')) data.price = source.price;
    if (wanted('sku')) data.sku = source.sourceSku;
    if (wanted('brandName')) data.brandId = brandId ?? null;
    if (wanted('categoryName')) data.categoryId = categoryId;
    if (wanted('design')) data.attributes = source.design ? { color: source.design } : {};

    if (Object.keys(data).length > 0) {
      await this.productService.update(planned.productId, data);
    }
    return planned.productId;
  }

  /** Replace the product's structured spec values from the file row. */
  private async writeSpecs(
    productId: string,
    source: ParsedProductRow,
    context: Awaited<ReturnType<CatalogImportService['resolveReferences']>>,
  ): Promise<void> {
    const definitions = context.definitions.get(source.categoryName);
    if (!definitions) {
      return;
    }
    const values = Object.entries(source.attributes)
      .map(([key, value]) => {
        const definitionId = definitions.get(key);
        return definitionId ? { definitionId, value } : null;
      })
      .filter((value): value is { definitionId: string; value: string } => value !== null);
    await this.repository.setSpecValues(productId, values);
  }

  /** Replace the product's device compatibility from the file row. */
  private async writeCompat(
    productId: string,
    source: ParsedProductRow,
    context: Awaited<ReturnType<CatalogImportService['resolveReferences']>>,
  ): Promise<void> {
    const deviceBrandId = source.deviceBrandName
      ? context.deviceBrands.get(source.deviceBrandName)
      : undefined;
    if (!deviceBrandId) {
      return;
    }
    const ids = source.deviceModelNames
      .map((name) => context.deviceModels.get(`${deviceBrandId} ${name}`))
      .filter((id): id is string => Boolean(id));
    await this.repository.setDeviceCompat(productId, ids);
  }

  /** Record a run as failed, with the reason the operator will see. */
  async failRun(id: string, error: string): Promise<void> {
    const run = await this.repository.updateRun(id, {
      status: CatalogImportStatus.FAILED,
      error,
    });
    await this.discardWorkbook(run);
  }

  findNextApplying(): Promise<CatalogImportRun | null> {
    return this.repository.findNextApplying();
  }
}
