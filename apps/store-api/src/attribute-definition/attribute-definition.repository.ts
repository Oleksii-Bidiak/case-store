import { Injectable } from '@nestjs/common';
import { AttributeDefinition, AttributeType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { CategoryRepository } from '../category';

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

  /** Own-category templates only, ordered by `sortOrder` then `label`. */
  findByCategoryId(categoryId: string): Promise<AttributeDefinition[]> {
    return this.prisma.attributeDefinition.findMany({
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

  /** Create a template. `options` is persisted as a JSON string array (or null). */
  create(data: CreateAttributeDefinitionInput): Promise<AttributeDefinition> {
    return this.prisma.attributeDefinition.create({
      data: {
        categoryId: data.categoryId,
        key: data.key,
        label: data.label,
        type: data.type ?? AttributeType.TEXT,
        unit: data.unit ?? null,
        options: this.toOptionsJson(data.options),
        isFilterable: data.isFilterable ?? false,
        sortOrder: data.sortOrder ?? 0,
      },
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
   * Rewrite `sortOrder` for a category's templates to match `orderedIds` — each
   * definition's new order is its index in the array. Runs in one transaction;
   * the `categoryId` guard keeps a stray id from another category untouched.
   */
  async reorder(categoryId: string, orderedIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.attributeDefinition.updateMany({
          where: { id, categoryId },
          data: { sortOrder: index },
        }),
      ),
    );
  }

  /** Normalize an options array into the Prisma JSON column value (or DB null). */
  private toOptionsJson(options?: string[] | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (options === undefined || options === null) {
      return Prisma.JsonNull;
    }
    return options as Prisma.InputJsonValue;
  }
}
