import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductGroupRepository, FindAllGroupsParams } from './product-group.repository';
import { CreateProductGroupDto, UpdateProductGroupDto, ProductGroupListQueryDto } from './dto';
import { ProductGroupSummaryEntity, ProductGroupDetailEntity } from './entities';

/** Pagination metadata carried by the group list response. */
interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Group list envelope. `meta` is present even for an unpaginated read so the panel
 * can show a truthful row count without branching on the query.
 */
interface ProductGroupListResponse {
  data: ProductGroupSummaryEntity[];
  meta: PaginationMeta;
}

/**
 * Business logic for product-group management (TASK-142). Maps repository rows
 * to admin entities and enforces existence on read/update.
 */
@Injectable()
export class ProductGroupService {
  constructor(private readonly repository: ProductGroupRepository) {}

  /**
   * List groups for the admin groups page (with axes + position counts), with an
   * optional name search and opt-in pagination. Omitting `page`/`limit` returns the
   * complete list — what the product form's group picker needs (TASK-357).
   */
  async findAll(query: ProductGroupListQueryDto = {}): Promise<ProductGroupListResponse> {
    const params: FindAllGroupsParams = {
      page: query.page,
      limit: query.limit,
      search: query.search,
    };
    const { groups, total } = await this.repository.findAll(params);

    return {
      data: groups.map((g) => ProductGroupSummaryEntity.fromPrisma(g)),
      meta: this.buildMeta(total, query.page, query.limit),
    };
  }

  /**
   * Pagination metadata. With no `limit` the whole list came back in one response,
   * so it is reported as a single page of size `total` rather than inventing a page
   * size the caller never asked for. An EMPTY unpaginated list would make that size
   * 0, so `totalPages` is short-circuited instead of dividing by zero.
   */
  private buildMeta(total: number, page?: number, limit?: number): PaginationMeta {
    const effectiveLimit = limit ?? total;

    return {
      total,
      page: page ?? 1,
      limit: effectiveLimit,
      totalPages: effectiveLimit === 0 ? 0 : Math.ceil(total / effectiveLimit),
    };
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
