import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';

/** Page size used when the caller asks for a page but names no `limit` (TASK-357). */
const DEFAULT_ADMIN_PAGE_SIZE = 20;

/**
 * Filter params for the group list. `page` / `limit` are OPTIONAL and jointly
 * opt-in: with both absent the read returns the complete list, which is what the
 * product form's group picker needs.
 */
export interface FindAllGroupsParams {
  page?: number;
  limit?: number;
  search?: string;
}

/** Axis input when creating/replacing a group's axes. */
export interface AxisInput {
  name: string;
  sortOrder?: number;
}

export interface CreateProductGroupData {
  name: string;
  isActive?: boolean;
  axes?: AxisInput[];
}

export interface UpdateProductGroupData {
  name?: string;
  isActive?: boolean;
  /** When provided, replaces the group's axes wholesale. */
  axes?: AxisInput[];
}

/** Shared include for axes (ordered) and positions (ordered) on a group. */
const GROUP_DETAIL_INCLUDE = {
  axes: {
    orderBy: { sortOrder: 'asc' as const },
    select: { name: true, sortOrder: true },
  },
  positions: {
    where: { deletedAt: null },
    orderBy: { positionOrder: 'asc' as const },
    select: {
      id: true,
      slug: true,
      name: true,
      price: true,
      attributes: true,
      stock: true,
      isActive: true,
      positionOrder: true,
    },
  },
} as const;

/**
 * Database access for product groups (TASK-142). Encapsulates all Prisma queries
 * for the admin group-management endpoints. Axis rows are owned by the group and
 * cascade-deleted; updating axes replaces them in a transaction.
 */
@Injectable()
export class ProductGroupRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List groups with their axes and a count of member positions, with an optional
   * name search and opt-in pagination (TASK-357).
   *
   * With neither `page` nor `limit` the query keeps its pre-TASK-357 shape — no
   * `skip`/`take`, and `total` comes from the rows we already hold rather than a
   * second `count` round-trip.
   */
  async findAll(params: FindAllGroupsParams = {}) {
    const where: Prisma.ProductGroupWhereInput = {
      ...(params.search && { name: { contains: params.search, mode: 'insensitive' } }),
    };
    const query = {
      where,
      orderBy: { createdAt: 'desc' as const },
      include: {
        axes: {
          orderBy: { sortOrder: 'asc' as const },
          select: { name: true, sortOrder: true },
        },
        _count: { select: { positions: true } },
      },
    };

    if (params.page === undefined && params.limit === undefined) {
      const groups = await this.prisma.productGroup.findMany(query);
      return { groups, total: groups.length };
    }

    const limit = params.limit ?? DEFAULT_ADMIN_PAGE_SIZE;
    const skip = ((params.page ?? 1) - 1) * limit;

    const [groups, total] = await Promise.all([
      this.prisma.productGroup.findMany({ ...query, skip, take: limit }),
      this.prisma.productGroup.count({ where }),
    ]);

    return { groups, total };
  }

  /** Get a single group with its axes and positions, or null. */
  findById(id: string) {
    return this.prisma.productGroup.findUnique({
      where: { id },
      include: GROUP_DETAIL_INCLUDE,
    });
  }

  /** Create a group together with its initial axes. */
  create(data: CreateProductGroupData) {
    return this.prisma.productGroup.create({
      data: {
        name: data.name,
        isActive: data.isActive ?? true,
        axes: data.axes
          ? {
              create: data.axes.map((axis, index) => ({
                name: axis.name,
                sortOrder: axis.sortOrder ?? index,
              })),
            }
          : undefined,
      },
      include: GROUP_DETAIL_INCLUDE,
    });
  }

  /**
   * Update a group's name/active flag and, when `axes` is provided, replace its
   * axes wholesale. Runs in a transaction so the replace is atomic.
   */
  async update(id: string, data: UpdateProductGroupData) {
    return this.prisma.$transaction(async (tx) => {
      if (data.axes !== undefined) {
        await tx.productGroupAxis.deleteMany({ where: { groupId: id } });
        if (data.axes.length > 0) {
          await tx.productGroupAxis.createMany({
            data: data.axes.map((axis, index) => ({
              groupId: id,
              name: axis.name,
              sortOrder: axis.sortOrder ?? index,
            })),
          });
        }
      }

      return tx.productGroup.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
        include: GROUP_DETAIL_INCLUDE,
      });
    });
  }
}
