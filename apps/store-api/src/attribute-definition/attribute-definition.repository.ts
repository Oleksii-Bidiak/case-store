import { Injectable } from '@nestjs/common';
import { AttributeDefinition, AttributeType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { CategoryRepository } from '../category';
import { COLOR_SPEC_KEY, COLOR_SPEC_LABEL } from '../common/color-axis';
import { ReorderTx, acquireAdvisoryLocks, lockKey, reorderBucket } from '../common/reorder';

/**
 * Advisory-lock namespace for attribute definitions (TASK-298). The prefix is MANDATORY —
 * locks are DATABASE-GLOBAL, so without it a definition reorder would serialise against an
 * unrelated resource's.
 */
const LOCK_RESOURCE = 'attribute-definitions';

/**
 * A definition's sibling bucket is its OWNING CATEGORY: `sortOrder` is only ever compared
 * within one category's own template list (inheritance merges ancestors' definitions at READ
 * time, in `findEffectiveForCategory`, and re-sorts the merged set — it never makes two
 * categories share a slot space). So the lock is per-category: two admins editing two
 * different categories' templates do not queue behind each other.
 */
const bucketLockKey = (categoryId: string): string => lockKey(LOCK_RESOURCE, categoryId);

/** Either the singleton client or an interactive-transaction one (TASK-298). */
type AttributeDefinitionDbClient = PrismaService | ReorderTx;

/**
 * Fields for creating a structured-spec template. `categoryId` is supplied by
 * the service from the route param; `options` is stored as a JSON string array.
 */
export interface CreateAttributeDefinitionInput {
  categoryId: string;
  key: string;
  label: string;
  type?: AttributeType;
  unit?: string | null;
  options?: string[] | null;
  isFilterable?: boolean;
  sortOrder?: number;
}

/**
 * Fields for updating a template. Only provided fields are written. `categoryId`
 * is intentionally absent — a definition never moves between categories.
 */
export interface UpdateAttributeDefinitionInput {
  key?: string;
  label?: string;
  type?: AttributeType;
  unit?: string | null;
  options?: string[] | null;
  isFilterable?: boolean;
  sortOrder?: number;
}

/**
 * Repository for per-category structured-spec templates (TASK-191). Owns all
 * Prisma access for `AttributeDefinition` plus the subtree-inheritance
 * resolution (effective definitions = own category + every ancestor's), built
 * on {@link CategoryRepository.findAncestorIds} (plan 109 / TASK-236).
 */
@Injectable()
export class AttributeDefinitionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoryRepository: CategoryRepository,
  ) {}

  /**
   * Own-category templates only, ordered by `sortOrder` then `label`.
   *
   * Accepts a transaction client (TASK-298) so the reorder endpoint can re-read the refreshed
   * list inside its own transaction.
   */
  findByCategoryId(
    categoryId: string,
    client: AttributeDefinitionDbClient = this.prisma,
  ): Promise<AttributeDefinition[]> {
    return client.attributeDefinition.findMany({
      where: { categoryId },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  /** Find a single definition by id, or null. */
  findById(id: string): Promise<AttributeDefinition | null> {
    return this.prisma.attributeDefinition.findUnique({ where: { id } });
  }

  /**
   * Find a definition by its `(categoryId, key)` unique pair — used to surface a
   * friendly duplicate-key error before a create/update hits the DB constraint.
   */
  findByCategoryAndKey(categoryId: string, key: string): Promise<AttributeDefinition | null> {
    return this.prisma.attributeDefinition.findUnique({
      where: { categoryId_key: { categoryId, key } },
    });
  }

  /**
   * Resolve the EFFECTIVE templates for a category: its own definitions plus
   * every ancestor's, de-duplicated by `key` with the most specific (deepest)
   * category winning a collision — so a leaf may override a broader ancestor's
   * template for the same key (doc 099 §4.3, "успадковується піддеревом").
   *
   * Depth is computed by walking the ancestor chain upward from the target
   * category (self = depth 0, parent = 1, …); the smallest depth for a given key
   * wins. Result is ordered by `sortOrder` then `label` for a stable render.
   */
  async findEffectiveForCategory(categoryId: string): Promise<AttributeDefinition[]> {
    const ancestorIds = await this.categoryRepository.findAncestorIds(categoryId);

    const [defs, cats] = await Promise.all([
      this.prisma.attributeDefinition.findMany({
        where: { categoryId: { in: ancestorIds } },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      }),
      this.prisma.category.findMany({
        where: { id: { in: ancestorIds } },
        select: { id: true, parentId: true },
      }),
    ]);

    const parentOf = new Map(cats.map((c) => [c.id, c.parentId]));
    const depthOf = new Map<string, number>();
    let current: string | null = categoryId;
    let depth = 0;
    while (current !== null && !depthOf.has(current)) {
      depthOf.set(current, depth);
      current = parentOf.get(current) ?? null;
      depth += 1;
    }

    const winnerByKey = new Map<string, { def: AttributeDefinition; depth: number }>();
    for (const def of defs) {
      const d = depthOf.get(def.categoryId) ?? Number.MAX_SAFE_INTEGER;
      const existing = winnerByKey.get(def.key);
      if (!existing || d < existing.depth) {
        winnerByKey.set(def.key, { def, depth: d });
      }
    }

    return [...winnerByKey.values()]
      .map((w) => w.def)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  }

  /**
   * Create a template, APPENDED to the end of its category's list (`sortOrder = max + 1`,
   * `0` for the category's first template) — TASK-298.
   *
   * The old `data.sortOrder ?? 0` default stacked every new template ON TOP OF the first one:
   * the admin editor does not send a hand-typed `sortOrder`, so the whole list would sit at
   * slot 0 and its order would fall back to the `label` tiebreaker. Same shape as
   * `DeviceRepository.createBrand`: the `max + 1` read runs inside a transaction holding the
   * CATEGORY's advisory lock, so it cannot race a concurrent append or a concurrent
   * {@link reorder} and hand out a duplicate slot.
   *
   * An EXPLICIT `data.sortOrder` still wins — the append is only the default.
   *
   * `options` is persisted as a JSON string array (or null).
   */
  create(data: CreateAttributeDefinitionInput): Promise<AttributeDefinition> {
    return this.prisma.$transaction(async (tx) => {
      await acquireAdvisoryLocks(tx, [bucketLockKey(data.categoryId)]);

      let sortOrder = data.sortOrder;
      if (sortOrder === undefined) {
        const { _max } = await tx.attributeDefinition.aggregate({
          where: { categoryId: data.categoryId },
          _max: { sortOrder: true },
        });
        sortOrder = _max.sortOrder === null ? 0 : _max.sortOrder + 1;
      }

      return tx.attributeDefinition.create({
        data: {
          categoryId: data.categoryId,
          key: data.key,
          label: data.label,
          type: data.type ?? AttributeType.TEXT,
          unit: data.unit ?? null,
          options: this.toOptionsJson(data.options),
          isFilterable: data.isFilterable ?? false,
          sortOrder,
        },
      });
    });
  }

  /** Update a template. Only provided fields are written. */
  update(id: string, data: UpdateAttributeDefinitionInput): Promise<AttributeDefinition> {
    const { options, ...rest } = data;
    return this.prisma.attributeDefinition.update({
      where: { id },
      data: {
        ...rest,
        ...(options !== undefined ? { options: this.toOptionsJson(options) } : {}),
      },
    });
  }

  /** Delete a template (cascades to its ProductAttributeValue rows). */
  delete(id: string): Promise<AttributeDefinition> {
    return this.prisma.attributeDefinition.delete({ where: { id } });
  }

  /**
   * Rewrite the COMPLETE ordering of ONE category's templates and return the refreshed list,
   * read inside the same transaction (TASK-298).
   *
   * This used to be a naive `$transaction([...updateMany])`: no advisory lock and no
   * staleness check, so two admins reordering the same category's templates silently
   * interleaved — the last writer's partial payload won and rows it never named kept a stale,
   * now-colliding `sortOrder`. It was the last `sortOrder` writer outside the shared recipe;
   * it now goes through {@link reorderBucket} exactly like banners / blog categories / device
   * brands (TASK-295).
   *
   * `scope: { categoryId }` is the safety net kept from the old implementation: every write is
   * `WHERE id = … AND category_id = …`, so an id forged from another category silently
   * updates nothing instead of being stolen into this one — and `assertFlatReorder` rejects it
   * as NOT_FOUND before any write happens anyway.
   *
   * Throws the domain errors of `common/reorder/reorder.errors.ts`; the service maps them.
   */
  reorder(categoryId: string, orderedIds: readonly string[]): Promise<AttributeDefinition[]> {
    return reorderBucket<AttributeDefinition[]>(this.prisma, {
      resource: LOCK_RESOURCE,
      bucket: categoryId,
      orderedIds,
      scope: { categoryId },
      snapshot: (tx) =>
        tx.attributeDefinition.findMany({ where: { categoryId }, select: { id: true } }),
      delegate: (tx) => tx.attributeDefinition,
      result: (tx) => this.findByCategoryId(categoryId, tx),
    });
  }

  /**
   * Collect the DISTINCT spec values currently in use for a set of definition
   * keys among ACTIVE, non-deleted products in a set of categories (the subtree)
   * — TASK-191 facet options. Matched by definition `key` (not id) so values
   * assigned against an ancestor's definition and a leaf's override of the same
   * key are pooled together. Returns a Map keyed by definition key, each value
   * list sorted ascending.
   */
  async findDistinctValuesByKey(
    keys: string[],
    categoryIds: string[],
  ): Promise<Map<string, string[]>> {
    if (keys.length === 0 || categoryIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.productAttributeValue.findMany({
      where: {
        definition: { key: { in: keys } },
        product: { categoryId: { in: categoryIds }, isActive: true, deletedAt: null },
      },
      select: { value: true, definition: { select: { key: true } } },
      orderBy: { value: 'asc' },
    });

    const byKey = new Map<string, Set<string>>();
    for (const row of rows) {
      const bucket = byKey.get(row.definition.key) ?? new Set<string>();
      bucket.add(row.value);
      byKey.set(row.definition.key, bucket);
    }
    return new Map([...byKey.entries()].map(([k, set]) => [k, [...set]]));
  }

  /**
   * Resolve the `color` definition a product in this category should file its
   * colour under, CREATING it on the category's root when nothing declares one
   * (TASK-487).
   *
   * Why it has to create: colour reaches the database through three doors — the
   * seed, the XLSX import and the admin's bulk edit — and only the first of them
   * runs after a declaration it controls. An operator setting «Чорний» on twelve
   * imported products in a category nobody declared colour on must still end up
   * with a filterable facet, otherwise the value lands in `attributes` JSON and
   * disappears from the catalogue exactly as it did before this task.
   *
   * Why the ROOT and not the product's own category: definitions are inherited
   * DOWNWARD (see {@link findEffectiveForCategory}). One declared on a leaf is
   * invisible while browsing the parent, so the facet would vanish the moment a
   * shopper stepped up one level — the failure mode is a filter that exists on
   * `/catalog?category=iphone-cases` and not on `/catalog?category=cases`.
   *
   * Prefers an EXISTING effective definition (leaf override included) over
   * creating anything: whoever declared it meant it, and a second row for the
   * same key would split one facet's values across two definitions.
   */
  async ensureColorDefinitionForCategory(categoryId: string): Promise<AttributeDefinition> {
    const effective = await this.findEffectiveForCategory(categoryId);
    const existing = effective.find((def) => def.key === COLOR_SPEC_KEY);
    if (existing) {
      return existing;
    }

    const chain = await this.categoryRepository.findAncestorChainOrdered(categoryId);
    const rootId = chain[chain.length - 1] ?? categoryId;

    return this.prisma.attributeDefinition.upsert({
      where: { categoryId_key: { categoryId: rootId, key: COLOR_SPEC_KEY } },
      // A SELECT with an empty option list, deliberately: the options are the
      // colours in use, and `addOptions` widens the list as values are written.
      // TEXT would be worse than useless — a TEXT definition is never offered as
      // a facet at all, which is the bug this whole task exists to fix.
      create: {
        categoryId: rootId,
        key: COLOR_SPEC_KEY,
        label: COLOR_SPEC_LABEL,
        type: AttributeType.SELECT,
        options: [] as unknown as Prisma.InputJsonValue,
        isFilterable: true,
        sortOrder: 0,
      },
      update: { type: AttributeType.SELECT, isFilterable: true },
    });
  }

  /**
   * Widen a SELECT definition's option list to include `values` (TASK-487).
   *
   * The admin spec editor renders a SELECT as a CLOSED dropdown, so a value
   * stored on a product but missing from `options` is a value an operator can
   * see on the storefront and cannot pick in the panel. Union, never replace:
   * removing an option silently un-picks a colour other products still use.
   *
   * No-op when every value is already present, so callers may call it freely.
   */
  async addOptions(definitionId: string, values: string[]): Promise<void> {
    const wanted = values.map((value) => value.trim()).filter((value) => value !== '');
    if (wanted.length === 0) {
      return;
    }

    const definition = await this.prisma.attributeDefinition.findUnique({
      where: { id: definitionId },
      select: { options: true },
    });
    if (!definition) {
      return;
    }

    const current = Array.isArray(definition.options)
      ? (definition.options as unknown[]).filter((o): o is string => typeof o === 'string')
      : [];
    const merged = [...new Set([...current, ...wanted])];
    if (merged.length === current.length) {
      return;
    }

    await this.prisma.attributeDefinition.update({
      where: { id: definitionId },
      data: { options: merged.sort((a, b) => a.localeCompare(b, 'uk')) as Prisma.InputJsonValue },
    });
  }

  /** Normalize an options array into the Prisma JSON column value (or DB null). */
  private toOptionsJson(options?: string[] | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (options === undefined || options === null) {
      return Prisma.JsonNull;
    }
    return options as Prisma.InputJsonValue;
  }
}
