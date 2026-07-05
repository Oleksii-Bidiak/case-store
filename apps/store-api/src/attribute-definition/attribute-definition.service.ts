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
import { CategoryRepository } from '../category';
import { AttributeDefinitionEntity } from './entities';
import {
  CreateAttributeDefinitionDto,
  UpdateAttributeDefinitionDto,
  ReorderAttributeDefinitionsDto,
} from './dto';

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
  ) {}

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

  /** Create a template on a category (admin-only). */
  async create(
    categoryId: string,
    dto: CreateAttributeDefinitionDto,
  ): Promise<AttributeDefinitionEntity> {
    await this.assertCategoryExists(categoryId);

    const type = dto.type ?? AttributeType.TEXT;
    this.validateOptions(type, dto.options);

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
    return AttributeDefinitionEntity.fromPrisma(updated);
  }

  /** Delete a template (admin-only). Cascades to its product values. */
  async delete(id: string): Promise<{ id: string }> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException('Characteristic not found');
    }
    await this.repository.delete(id);
    return { id };
  }

  /** Reorder a category's templates (admin-only). */
  async reorder(
    categoryId: string,
    dto: ReorderAttributeDefinitionsDto,
  ): Promise<AttributeDefinitionEntity[]> {
    await this.assertCategoryExists(categoryId);
    await this.repository.reorder(categoryId, dto.orderedIds);
    return this.findByCategory(categoryId);
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
