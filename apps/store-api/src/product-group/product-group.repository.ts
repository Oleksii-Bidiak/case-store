import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';

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

  /** List all groups with their axes and a count of member positions. */
  findAll() {
    return this.prisma.productGroup.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        axes: {
          orderBy: { sortOrder: 'asc' },
          select: { name: true, sortOrder: true },
        },
        _count: { select: { positions: true } },
      },
    });
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
