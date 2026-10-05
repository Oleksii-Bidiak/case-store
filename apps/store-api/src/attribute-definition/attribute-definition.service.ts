import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { AttributeType } from '@prisma/client';
import {
  AttributeDefinitionRepository,
  CreateAttributeDefinitionInput,
} from './attribute-definition.repository';
import { FACETABLE_TYPES, isFacetableType } from './attribute-definition.constants';
import { CategoryRepository } from '../category';
import { ConfigService } from '@nestjs/config';
import { CatalogueFilterResolver, ResolvedCatalogueFilters } from '../catalog-filter';
// eslint-disable-next-line local/no-deep-module-import -- cycle: product barrel > product.module > attribute-definition barrel > this file
import {
  MAX_SPEC_FACETS,
  parseSpecFilters,
  serializeSpecFilters,
  SpecFacetFilter,
} from '../product/dto/product-list-query.dto';
import { CacheService, buildFilterableSpecsKey, FILTERABLE_SPECS_PREFIX } from '../cache';
import { reorderErrorToHttp } from '../common/reorder';
import {
  AttributeDefinitionEntity,
  FacetCeilingReportEntity,
  FilterableSpecEntity,
} from './entities';
import {
  CreateAttributeDefinitionDto,
  UpdateAttributeDefinitionDto,
  ReorderAttributeDefinitionsDto,
  FilterableSpecsQueryDto,
} from './dto';

/** Same default as the listing cache (`ProductService`), so the two age together. */
const DEFAULT_CACHE_TTL_SECONDS = 300;

/**
 * Business logic for per-category structured-spec templates (TASK-191).
 * Enforces the `(categoryId, key)` uniqueness with a friendly error and the
 * "SELECT requires non-empty options" rule; delegates all persistence to
 * {@link AttributeDefinitionRepository}.
 */
@Injectable()
export class AttributeDefinitionService {
  constructor(
    private readonly repository: AttributeDefinitionRepository,
    private readonly categoryRepository: CategoryRepository,
    // Slug → id for the facet endpoint's `?brand=&device=` (TASK-420/489).
    // Provided, not imported as a module, exactly as `ProductModule` does it.
    private readonly catalogueFilters: CatalogueFilterResolver,
    // Facet-count cache (TASK-708). `RedisCacheModule` is global.
    private readonly cache: CacheService,
    config: ConfigService,
  ) {
    this.cacheTtlSeconds =
      config.get<number>('REDIS_CACHE_TTL_SECONDS') ?? DEFAULT_CACHE_TTL_SECONDS;
  }

  private readonly cacheTtlSeconds: number;

  /** List a category's OWN templates (not inherited ones), for the admin editor. */
  async findByCategory(categoryId: string): Promise<AttributeDefinitionEntity[]> {
    await this.assertCategoryExists(categoryId);
    const defs = await this.repository.findByCategoryId(categoryId);
    return defs.map((def) => AttributeDefinitionEntity.fromPrisma(def));
  }

  /**
   * Resolve the EFFECTIVE templates for a category (own + inherited) — used by
   * the product specs editor and PDP hydration.
   */
  async findEffectiveForCategory(categoryId: string): Promise<AttributeDefinitionEntity[]> {
    const defs = await this.repository.findEffectiveForCategory(categoryId);
    return defs.map((def) => AttributeDefinitionEntity.fromPrisma(def));
  }

  /**
   * Public catalog facets for a category (TASK-191): its EFFECTIVE `isFilterable`
   * definitions, each paired with the distinct values in use among products in
   * the category's subtree. Returns an empty list when the category declares no
   * filterable specs, so the storefront simply renders no facet controls.
   *
   * A definition whose type cannot be a facet is dropped too (TASK-488): a
   * facet is a SELECT or a BOOLEAN and never a TEXT — see {@link FACETABLE_TYPES}.
   * The write path already refuses that pair, so this filter is about the rows
   * that predate the rule: an imported catalogue types every column it meets as
   * TEXT (`CatalogImportRepository.ensureAttributeDefinitions`), and one
   * filterable TEXT definition is enough to publish a sidebar control with one
   * value per product in it.
   *
   * A definition with NO values in this subtree is dropped entirely (TASK-487).
   * Definitions are declared on the ROOT and inherited by every descendant, so
   * a facet the parent legitimately offers can be empty three levels down —
   * colour made this visible (cables and screen protectors have none at all),
   * but it was always true of every inherited spec. An empty facet renders as a
   * filter control a shopper can open and find nothing in, which reads as a
   * broken page rather than as "no such filter here".
   *
   * Since TASK-489 the values are not the definition's declared `options` and
   * not even the subtree's distinct values, but the values IN THE CURRENT SLICE
   * with their product counts — «Силікон (12)», where 12 accounts for the brand,
   * device, price, search, availability and other-facet filters `query` carries.
   * Two consequences, both deliberate:
   *   - a value nothing in the slice carries is ABSENT, not shown at zero: the
   *     old behaviour let a shopper tick «TPU» and land on an empty page, and
   *     that is the defect this task removes;
   *   - each facet is counted with its OWN selection lifted, which is why the
   *     repository takes the whole filter set rather than a ready-made `where`.
   *     Counting «TPU» under `material:Силікон` would give zero for every value
   *     but the ticked one, and the facet could then never be changed, only
   *     added to.
   *
   * At most `MAX_SPEC_FACETS` facets come back, and an active one is never
   * among the cut (TASK-707) — see {@link applyFacetCeiling}.
   */
  async getFilterableSpecs(
    categoryId: string,
    query: FilterableSpecsQueryDto = {},
  ): Promise<FilterableSpecEntity[]> {
    // Slug → id, the same resolution the listing does (TASK-420): the
    // repositories below never learn what a slug is. Resolved BEFORE the cache
    // read, exactly like `ProductService.findAll`, because the cache key is
    // keyed on the canonical slug this produces (TASK-708).
    const filters = await this.catalogueFilters.resolve({
      brand: query.brand,
      device: query.device,
    });
    const specFilters = parseSpecFilters(query.specs);

    // Cache-aside (TASK-708): `1 + 1 + N(selected facets)` live queries per
    // catalogue render otherwise. The key carries every axis the counts depend
    // on, so two categories or two filter sets never read each other's counts;
    // it lives under the listing prefix, so every write that purges the
    // listing purges these counts too (see `FILTERABLE_SPECS_PREFIX`).
    const cacheKey = buildFilterableSpecsKey({
      categoryId,
      brand: filters.brandKey,
      device: filters.deviceKey,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      search: query.search,
      // Keyed on what is APPLIED, as the listing is: malformed chunks and
      // anything past the caps drop out before they can fragment the key.
      specs: serializeSpecFilters(specFilters),
      inStock: query.inStock,
      onSale: query.onSale,
    });
    const cached = await this.cache.get<FilterableSpecEntity[]>(cacheKey);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const facets = await this.countFilterableSpecs(categoryId, query, filters, specFilters);
    await this.cache.set(cacheKey, facets, this.cacheTtlSeconds);
    return facets;
  }

  /** The uncached half of {@link getFilterableSpecs}. */
  private async countFilterableSpecs(
    categoryId: string,
    query: FilterableSpecsQueryDto,
    filters: ResolvedCatalogueFilters,
    specFilters: SpecFacetFilter[],
  ): Promise<FilterableSpecEntity[]> {
    const effective = await this.repository.findEffectiveForCategory(categoryId);
    const filterable = effective.filter((def) => def.isFilterable && isFacetableType(def.type));
    if (filterable.length === 0) {
      return [];
    }

    const subtreeIds = await this.categoryRepository.findSubtreeIds(categoryId);

    const valuesByKey = await this.repository.findValueCountsByKey(
      filterable.map((def) => def.key),
      {
        categoryIds: subtreeIds,
        brandId: filters.brandId,
        deviceModelId: filters.deviceModelId,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        search: query.search,
        specFilters,
        inStock: query.inStock,
        onSale: query.onSale,
        // The public visibility rules, spelled the way `ProductService.findAll`
        // spells them: only positions on sale (TASK-230), only in categories on
        // sale (TASK-297), never a tombstone (TASK-427). A count that ignored
        // any of the three would promise products the listing then refuses.
        isActive: true,
        categoryActiveOnly: true,
        deleted: false,
      },
    );

    const nonEmpty = filterable
      .map((def) => ({
        definition: AttributeDefinitionEntity.fromPrisma(def),
        values: valuesByKey.get(def.key) ?? [],
      }))
      .filter((facet) => facet.values.length > 0);

    return this.applyFacetCeiling(nonEmpty, new Set(specFilters.map((filter) => filter.key)));
  }

  /**
   * The facet ceiling (TASK-707, owner decision B-10 «стеля 6 фасетів»): at
   * most {@link MAX_SPEC_FACETS} facets per response, and the SAME constant
   * that caps how many facets one request may filter by — a seventh facet could
   * never be applied anyway. Before this the endpoint returned every facet and
   * the storefront cut the list with its own copy of the number, so a seventh
   * `isFilterable` definition vanished from the sidebar while its chip, fed by
   * the same uncapped response, still showed.
   *
   * Deterministic: facets keep template order (`sortOrder`, then label — the
   * order the admin editor sets), and the ceiling is counted over NON-EMPTY
   * facets, so an empty one never takes a slot.
   *
   * An ACTIVE facet is never hidden. A link can carry `?specs=` for a facet
   * past the ceiling (a shared URL, an old bookmark, a reordered template); the
   * listing IS narrowed by it, so the sidebar must still offer the checkbox
   * that undoes it — and the chips label themselves from this same response.
   * Active facets therefore always make the cut and the remaining slots go to
   * the others in template order. `parseSpecFilters` keeps at most
   * `MAX_SPEC_FACETS` active keys, so the result never exceeds the ceiling.
   */
  private applyFacetCeiling(
    facets: FilterableSpecEntity[],
    activeKeys: ReadonlySet<string>,
  ): FilterableSpecEntity[] {
    if (facets.length <= MAX_SPEC_FACETS) {
      return facets;
    }
    const activeCount = facets.filter((facet) => activeKeys.has(facet.definition.key)).length;
    let freeSlots = Math.max(MAX_SPEC_FACETS - activeCount, 0);
    return facets.filter((facet) => {
      if (activeKeys.has(facet.definition.key)) return true;
      if (freeSlots === 0) return false;
      freeSlots -= 1;
      return true;
    });
  }

  /**
   * Which categories of `categoryId`'s subtree declare more facets than the
   * storefront offers (TASK-707) — the admin-side signal for the ceiling that
   * {@link getFilterableSpecs} enforces.
   *
   * The whole SUBTREE, not just the category: definitions are inherited, so a
   * facet added on a root can push a grandchild over the ceiling while the
   * root itself stays under it. Counted over DECLARED facets (effective,
   * `isFilterable`, facetable type), not over the values of any one slice:
   * which facets are empty depends on the shopper's filters, so the declared
   * count is the only one that says "something can be cut here".
   */
  async getFacetCeilingReport(categoryId: string): Promise<FacetCeilingReportEntity> {
    await this.assertCategoryExists(categoryId);
    const subtreeIds = await this.categoryRepository.findSubtreeIds(categoryId);

    const perCategory = await Promise.all(
      subtreeIds.map(async (id) => {
        const effective = await this.repository.findEffectiveForCategory(id);
        const facets = effective.filter((def) => def.isFilterable && isFacetableType(def.type));
        return { id, facets };
      }),
    );
    const over = perCategory.filter(({ facets }) => facets.length > MAX_SPEC_FACETS);
    if (over.length === 0) {
      return { limit: MAX_SPEC_FACETS, categories: [] };
    }

    const names = new Map(
      (await this.categoryRepository.findByIds(over.map(({ id }) => id))).map((category) => [
        category.id,
        category.name,
      ]),
    );
    return {
      limit: MAX_SPEC_FACETS,
      categories: over.map(({ id, facets }) => ({
        categoryId: id,
        categoryName: names.get(id) ?? id,
        facetCount: facets.length,
        overflowLabels: facets.slice(MAX_SPEC_FACETS).map((def) => def.label),
      })),
    };
  }

  /** Create a template on a category (admin-only). */
  async create(
    categoryId: string,
    dto: CreateAttributeDefinitionDto,
  ): Promise<AttributeDefinitionEntity> {
    await this.assertCategoryExists(categoryId);

    const type = dto.type ?? AttributeType.TEXT;
    this.validateOptions(type, dto.options);
    this.validateFacetType(type, dto.isFilterable ?? false);

    const existing = await this.repository.findByCategoryAndKey(categoryId, dto.key);
    if (existing) {
      throw new ConflictException(`A characteristic with key "${dto.key}" already exists here`);
    }

    const input: CreateAttributeDefinitionInput = {
      categoryId,
      key: dto.key,
      label: dto.label,
      type,
      unit: dto.unit ?? null,
      options: type === AttributeType.SELECT ? (dto.options ?? []) : null,
      isFilterable: dto.isFilterable ?? false,
      sortOrder: dto.sortOrder,
    };
    const created = await this.repository.create(input);
    await this.purgeFacetCache();
    return AttributeDefinitionEntity.fromPrisma(created);
  }

  /** Update a template (admin-only). */
  async update(id: string, dto: UpdateAttributeDefinitionDto): Promise<AttributeDefinitionEntity> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException('Characteristic not found');
    }

    // Resolve the effective type after this update to validate options against it.
    const nextType = dto.type ?? existing.type;
    if (dto.options !== undefined || dto.type !== undefined) {
      const nextOptions =
        dto.options ??
        (Array.isArray(existing.options)
          ? (existing.options as unknown[]).filter((o): o is string => typeof o === 'string')
          : undefined);
      this.validateOptions(nextType, nextOptions);
    }
    this.validateFacetType(nextType, dto.isFilterable ?? existing.isFilterable);

    // If the key changes, re-check the (categoryId, key) uniqueness.
    if (dto.key !== undefined && dto.key !== existing.key) {
      const clash = await this.repository.findByCategoryAndKey(existing.categoryId, dto.key);
      if (clash && clash.id !== id) {
        throw new ConflictException(`A characteristic with key "${dto.key}" already exists here`);
      }
    }

    const updated = await this.repository.update(id, {
      key: dto.key,
      label: dto.label,
      type: dto.type,
      unit: dto.unit,
      isFilterable: dto.isFilterable,
      sortOrder: dto.sortOrder,
      // When switching away from SELECT, clear stale options; otherwise pass through.
      options: dto.type !== undefined && dto.type !== AttributeType.SELECT ? null : dto.options,
    });
    await this.purgeFacetCache();
    return AttributeDefinitionEntity.fromPrisma(updated);
  }

  /** Delete a template (admin-only). Cascades to its product values. */
  async delete(id: string): Promise<{ id: string }> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException('Characteristic not found');
    }
    await this.repository.delete(id);
    await this.purgeFacetCache();
    return { id };
  }

  /**
   * Reorder a category's templates (admin-only) and return the refreshed list — re-read
   * INSIDE the reorder transaction (TASK-298), so the admin panel resyncs to server truth in
   * one round-trip exactly as the other reorder endpoints do.
   *
   * The repository throws the pure domain errors of `common/reorder`; they become the stable
   * 400 / 404 / 409 codes here (409 = another admin added a template to this category since
   * the client read it, so `orderedIds` is only a PARTIAL ordering — reload and retry).
   */
  async reorder(
    categoryId: string,
    dto: ReorderAttributeDefinitionsDto,
  ): Promise<AttributeDefinitionEntity[]> {
    await this.assertCategoryExists(categoryId);

    let defs;
    try {
      defs = await this.repository.reorder(categoryId, dto.orderedIds);
    } catch (error) {
      throw reorderErrorToHttp(error);
    }

    // The facet sidebar renders in template order.
    await this.purgeFacetCache();
    return defs.map((def) => AttributeDefinitionEntity.fromPrisma(def));
  }

  /**
   * Drop every cached facet response (TASK-708). A template write changes
   * which facets a category offers, under which label and in which order —
   * across the whole subtree that inherits it — so a targeted eviction would
   * have to know every descendant category and every filter set; the prefix is
   * the honest scope. Everything else that moves a count (stock, prices, spec
   * values, visibility) already purges the listing prefix this one nests under.
   */
  private async purgeFacetCache(): Promise<void> {
    await this.cache.delByPrefix(FILTERABLE_SPECS_PREFIX);
  }

  /**
   * A facet is a SELECT or a BOOLEAN, never a TEXT and never a NUMBER
   * (TASK-488 / B-10). Checked on the RESULTING pair, so switching a filterable
   * SELECT to TEXT fails as loudly as ticking the box on a TEXT definition
   * does — otherwise the panel could reach the forbidden state in two steps.
   *
   * Deliberately NOT a silent unticking of `isFilterable`: a facet quietly
   * disappearing from the storefront is the kind of change an operator finds
   * out about from a customer.
   */
  private validateFacetType(type: AttributeType, isFilterable: boolean): void {
    if (isFilterable && !isFacetableType(type)) {
      throw new BadRequestException(
        `Only ${FACETABLE_TYPES.join(' / ')} characteristics can be used as a catalogue filter ` +
          `— free-text and numeric values give one filter value per product`,
      );
    }
  }

  /** SELECT definitions must ship a non-empty options list. */
  private validateOptions(type: AttributeType, options?: string[] | null): void {
    if (type === AttributeType.SELECT) {
      if (!options || options.length === 0) {
        throw new BadRequestException('A SELECT characteristic requires at least one option');
      }
    }
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await this.categoryRepository.findById(categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }
}
