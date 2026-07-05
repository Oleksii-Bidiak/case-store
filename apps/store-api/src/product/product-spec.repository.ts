import { Injectable } from '@nestjs/common';
import { Prisma, ProductAttributeValue, AttributeType } from '@prisma/client';
import { PrismaService } from '../prisma';

/**
 * A spec-value row joined with its definition — the read shape consumed by the
 * product entity's spec/highlight hydration.
 */
export interface SpecValueWithDefinition extends ProductAttributeValue {
  definition: {
    key: string;
    label: string;
    type: AttributeType;
    unit: string | null;
    isFilterable: boolean;
    sortOrder: number;
  };
}

/** A validated spec value ready to persist (produced by ProductService). */
export interface SpecValueWrite {
  definitionId: string;
  value: string;
  valueNumber?: number | null;
}

/**
 * Repository for product structured-spec VALUES (TASK-191), co-located in the
 * product module (mirrors the file-per-concern split used elsewhere). Owns the
 * `ProductAttributeValue` Prisma access; the effective-definition resolution and
 * type validation live in {@link ProductService} (cross-module business logic).
 */
@Injectable()
export class ProductSpecRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Load a product's spec values joined with their definitions, ordered by the
   * definition's `sortOrder` then `label` for a stable render.
   */
  getSpecs(productId: string): Promise<SpecValueWithDefinition[]> {
    return this.prisma.productAttributeValue.findMany({
      where: { productId },
      include: {
        definition: {
          select: {
            key: true,
            label: true,
            type: true,
            unit: true,
            isFilterable: true,
            sortOrder: true,
          },
        },
      },
      orderBy: [{ definition: { sortOrder: 'asc' } }, { definition: { label: 'asc' } }],
    });
  }

  /**
   * Replace the FULL spec-value set for a product in one transaction (TASK-191):
   * delete all existing rows, then insert the provided (already-validated) ones.
   * Replace-all keeps the write idempotent and avoids partial states — the
   * service validates every row against the product's effective definition set
   * before calling this, so no partial write can occur.
   */
  async setSpecs(productId: string, values: SpecValueWrite[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.productAttributeValue.deleteMany({ where: { productId } }),
      ...(values.length > 0
        ? [
            this.prisma.productAttributeValue.createMany({
              data: values.map((v) => ({
                productId,
                definitionId: v.definitionId,
                value: v.value,
                valueNumber:
                  v.valueNumber === undefined || v.valueNumber === null
                    ? null
                    : new Prisma.Decimal(v.valueNumber),
              })),
            }),
          ]
        : []),
    ]);
  }
}
