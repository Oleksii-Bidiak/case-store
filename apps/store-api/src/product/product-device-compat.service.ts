import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryRepository, toCategoryIconKey } from '../category';
import { DeviceRepository } from '../device';
import { ProductDeviceCompatRepository } from './product-device-compat.repository';
import { ProductService } from './product.service';
import type { BulkCompatMode } from './dto';
import type {
  BulkDeviceCompatResultEntity,
  CoverageCategoryEntity,
  DeviceModelCoverageEntity,
} from './entities';

/** What the bulk write is asked to do, after DTO validation. */
export interface BulkDeviceCompatInput {
  productIds: string[];
  mode: BulkCompatMode;
  deviceModelIds?: string[];
  series?: string[];
}

/** Suspects shown on the coverage page. */
export const COVERAGE_SUSPECT_LIMIT = 10;
/**
 * Raw name matches read before {@link mentionsModel} narrows them: «15 Pro» also
 * matches every «15 Pro Max» product, so the first ten raw rows could all be the
 * bigger phone.
 */
const SUSPECT_CANDIDATE_LIMIT = 60;

/**
 * Tokens that turn a model name into ANOTHER model when they follow it:
 * «iPhone 15» + « Pro» is the iPhone 15 Pro, «Galaxy S24» + « Ultra» the Ultra.
 */
const VARIANT_SUFFIXES = new Set(['pro', 'max', 'plus', 'mini', 'ultra', 'lite', 'fe', 'edge']);

/**
 * Does `productName` mention the model itself, not a bigger sibling or a longer
 * number? Every case-insensitive occurrence is checked; one clean occurrence is
 * enough («Скло для iPhone 15 Pro / 15 Pro Max» mentions the 15 Pro). An occurrence
 * is clean when the next character is not a letter or digit («iPhone 1» is not in
 * «iPhone 15») and the next word is not a variant suffix.
 */
export function mentionsModel(productName: string, modelName: string): boolean {
  const haystack = productName.toLocaleLowerCase('uk-UA');
  const needle = modelName.trim().toLocaleLowerCase('uk-UA');
  if (needle.length === 0) return false;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;
    const rest = haystack.slice(at + needle.length);
    const glued = /^[\p{L}\p{N}]/u.test(rest);
    const nextWord = /^\s+([\p{L}\p{N}]+)/u.exec(rest)?.[1] ?? '';
    if (!glued && !VARIANT_SUFFIXES.has(nextWord)) return true;
    from = at + 1;
  }
}

/**
 * Which products a bulk write would actually change, given their current sets.
 * The write itself is set-based (one statement per mode), so this is what keeps
 * `updatedProducts` honest and lets an idempotent re-run skip every purge.
 */
export function productsChangedBy(
  mode: BulkCompatMode,
  productIds: readonly string[],
  deviceModelIds: readonly string[],
  current: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const target = new Set(deviceModelIds);
  return productIds.filter((productId) => {
    const have = current.get(productId) ?? new Set<string>();
    switch (mode) {
      case 'add':
        return deviceModelIds.some((id) => !have.has(id));
      case 'remove':
        return deviceModelIds.some((id) => have.has(id));
      case 'replace':
        return have.size !== target.size || [...have].some((id) => !target.has(id));
    }
  });
}

/**
 * A «hole»: the model has nothing in a category where a sibling of its series has
 * at least one product. Without siblings there is nothing to compare with, so no
 * holes. `counts[0]` is the model, the rest are the siblings.
 */
export function isCoverageHole(category: Pick<CoverageCategoryEntity, 'counts'>): boolean {
  const [own, ...siblings] = category.counts;
  return (own?.productCount ?? 0) === 0 && siblings.some((cell) => cell.productCount > 0);
}

/**
 * ProductDeviceCompatService — device compatibility seen from the DEVICE side
 * (TASK-1955): one change for many products at once, and the assortment of one
 * model next to its series.
 *
 * Lives in the product module, not the device module: `ProductModule` imports
 * `DeviceModule`, so the device side cannot reach `ProductService` and its cache
 * obligations — and a compat write is a product write.
 */
@Injectable()
export class ProductDeviceCompatService {
  constructor(
    private readonly compatRepository: ProductDeviceCompatRepository,
    private readonly deviceRepository: DeviceRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly productService: ProductService,
  ) {}

  /**
   * Add / remove / replace the same models on many products (`PUT
   * /admin/devices/compat/bulk`). Everything is validated before the first write:
   * series expand to their models, unknown series / model / product ids are a 400,
   * and an empty model set is a 400 too — `replace` with nothing would silently wipe
   * the compat of every selected product.
   *
   * Only products whose set really changes are written, evicted and re-indexed;
   * `added`/`removed` are the row counts the database reports.
   */
  async bulkUpdate(input: BulkDeviceCompatInput): Promise<BulkDeviceCompatResultEntity> {
    const deviceModelIds = await this.resolveModelIds(
      input.deviceModelIds ?? [],
      input.series ?? [],
    );
    if (deviceModelIds.length === 0) {
      throw new BadRequestException('Name at least one device model or series');
    }

    const productIds = [...new Set(input.productIds)];
    const products = await this.compatRepository.findLiveProducts(productIds);
    const found = new Set(products.map((product) => product.id));
    const unknown = productIds.filter((id) => !found.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown product id(s): ${unknown.join(', ')}`);
    }

    const current = await this.compatRepository.getModelIdSetsByProductIds(productIds);
    const changedIds = productsChangedBy(input.mode, productIds, deviceModelIds, current);
    if (changedIds.length === 0) {
      return { updatedProducts: 0, added: 0, removed: 0 };
    }

    let added = 0;
    let removed = 0;
    switch (input.mode) {
      case 'add':
        added = await this.compatRepository.addCompat(changedIds, deviceModelIds);
        break;
      case 'remove':
        removed = await this.compatRepository.removeCompat(changedIds, deviceModelIds);
        break;
      case 'replace':
        ({ added, removed } = await this.compatRepository.replaceCompat(
          changedIds,
          deviceModelIds,
        ));
        break;
    }

    const changed = new Set(changedIds);
    await this.productService.afterDeviceCompatWrite(
      products.filter((product) => changed.has(product.id)),
    );

    return { updatedProducts: changedIds.length, added, removed };
  }

  /**
   * The coverage page of one model (`GET /admin/devices/models/:id/coverage`): its
   * series siblings, the per-root-category matrix, how many holes it has, and up to
   * ten products that name it but are not linked to it. 404 for an unknown model.
   */
  async getModelCoverage(modelId: string): Promise<DeviceModelCoverageEntity> {
    const model = await this.deviceRepository.findModelById(modelId);
    if (!model) {
      throw new NotFoundException('Device model not found');
    }

    const siblings = model.series
      ? (await this.deviceRepository.findModelsBySeries([model.series]))
          .filter(
            (other) =>
              other.id !== model.id &&
              other.isActive &&
              other.deviceBrandId === model.deviceBrandId,
          )
          .sort((a, b) => a.name.localeCompare(b.name, 'uk', { numeric: true }))
          .map((other) => ({ id: other.id, name: other.name }))
      : [];
    const columnIds = [model.id, ...siblings.map((sibling) => sibling.id)];

    const [cells, stats, candidates] = await Promise.all([
      this.compatRepository.countByRootCategory(columnIds),
      this.compatRepository.countModelProducts(model.id),
      this.compatRepository.findNameCandidatesWithoutModel(
        model.name,
        model.id,
        SUSPECT_CANDIDATE_LIMIT,
      ),
    ]);

    const countsByRoot = new Map<string, Map<string, number>>();
    for (const cell of cells) {
      if (cell.productCount <= 0) continue;
      const row = countsByRoot.get(cell.rootCategoryId) ?? new Map<string, number>();
      row.set(cell.deviceModelId, cell.productCount);
      countsByRoot.set(cell.rootCategoryId, row);
    }
    const roots = await this.categoryRepository.findByIds([...countsByRoot.keys()]);
    const categories: CoverageCategoryEntity[] = roots
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'uk'))
      .map((root) => {
        const row = countsByRoot.get(root.id) ?? new Map<string, number>();
        return {
          id: root.id,
          name: root.name,
          slug: root.slug,
          icon: toCategoryIconKey(root.icon),
          counts: columnIds.map((deviceModelId) => ({
            deviceModelId,
            productCount: row.get(deviceModelId) ?? 0,
          })),
        };
      });

    return {
      model: {
        id: model.id,
        name: model.name,
        slug: model.slug,
        series: model.series,
        brandName: model.brand.name,
        isActive: model.isActive,
      },
      siblings,
      stats: { ...stats, holes: categories.filter(isCoverageHole).length },
      categories,
      suspects: candidates
        .filter((candidate) => mentionsModel(candidate.name, model.name))
        .slice(0, COVERAGE_SUSPECT_LIMIT),
    };
  }

  /**
   * `deviceModelIds` ∪ every model of `series`, de-duplicated. A model id that
   * names nothing, or a series with no model at all, is a 400 — the operator
   * picked it from a list, so a miss means a stale screen, not "nothing to do".
   */
  private async resolveModelIds(deviceModelIds: string[], series: string[]): Promise<string[]> {
    const ids = [...new Set(deviceModelIds)];
    if (ids.length > 0) {
      const found = new Set((await this.deviceRepository.findModelsByIds(ids)).map((m) => m.id));
      const unknown = ids.filter((id) => !found.has(id));
      if (unknown.length > 0) {
        throw new BadRequestException(`Unknown device model id(s): ${unknown.join(', ')}`);
      }
    }

    const wanted = [...new Set(series)];
    if (wanted.length > 0) {
      const models = await this.deviceRepository.findModelsBySeries(wanted);
      const covered = new Set(models.map((m) => m.series));
      const unknown = wanted.filter((name) => !covered.has(name));
      if (unknown.length > 0) {
        throw new BadRequestException(`Unknown device series: ${unknown.join(', ')}`);
      }
      for (const model of models) {
        if (!ids.includes(model.id)) ids.push(model.id);
      }
    }
    return ids;
  }
}
