import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductGroupRepository } from './product-group.repository';
import { CreateProductGroupDto, UpdateProductGroupDto } from './dto';
import { ProductGroupSummaryEntity, ProductGroupDetailEntity } from './entities';

/**
 * Business logic for product-group management (TASK-142). Maps repository rows
 * to admin entities and enforces existence on read/update.
 */
@Injectable()
export class ProductGroupService {
  constructor(private readonly repository: ProductGroupRepository) {}

  /** List all groups for the admin groups page (with axes + position counts). */
  async findAll(): Promise<ProductGroupSummaryEntity[]> {
    const groups = await this.repository.findAll();
    return groups.map((g) => ProductGroupSummaryEntity.fromPrisma(g));
  }

  /** Get a group with its axes and positions, or throw 404. */
  async findById(id: string): Promise<ProductGroupDetailEntity> {
    const group = await this.repository.findById(id);
    if (!group) {
      throw new NotFoundException('Product group not found');
    }
    return ProductGroupDetailEntity.fromPrisma(group);
  }

  /** Create a group with its initial axes. */
  async create(dto: CreateProductGroupDto): Promise<ProductGroupDetailEntity> {
    const group = await this.repository.create({
      name: dto.name,
      isActive: dto.isActive,
      axes: dto.axes,
    });
    return ProductGroupDetailEntity.fromPrisma(group);
  }

  /** Update a group's name/active flag and (optionally) replace its axes. */
  async update(id: string, dto: UpdateProductGroupDto): Promise<ProductGroupDetailEntity> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException('Product group not found');
    }
    const group = await this.repository.update(id, {
      name: dto.name,
      isActive: dto.isActive,
      axes: dto.axes,
    });
    return ProductGroupDetailEntity.fromPrisma(group);
  }
}
