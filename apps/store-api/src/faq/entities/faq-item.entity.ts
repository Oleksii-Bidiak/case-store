import { ApiProperty } from '@nestjs/swagger';
import { FaqItem } from '@prisma/client';

/**
 * Domain entity representing a single global FAQ entry (TASK-242).
 *
 * A clean domain entity — not a Prisma model. Returned by FaqService and reused
 * on the storefront `/info` hub and the PDP, and emitted as FAQPage JSON-LD.
 * `isActive` is the reversible visibility toggle; `sortOrder` controls display
 * order (ascending).
 */
export class FaqItemEntity {
  @ApiProperty({
    description: 'FAQ item unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'The question shown to the shopper',
    example: 'Скільки коштує доставка?',
  })
  question!: string;

  @ApiProperty({
    description: 'The answer shown when the question is expanded',
    example: 'Доставка Новою Поштою — за тарифами перевізника.',
  })
  answer!: string;

  @ApiProperty({
    description: 'Display order (ascending). Lower numbers appear first.',
    example: 0,
  })
  sortOrder!: number;

  @ApiProperty({
    description: 'Whether the FAQ item is visible on the storefront',
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({ description: 'Creation timestamp', example: '2026-07-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2026-07-01T00:00:00.000Z' })
  updatedAt!: Date;

  /**
   * Build a FaqItemEntity from a Prisma FaqItem model.
   */
  static fromPrisma(item: FaqItem): FaqItemEntity {
    const entity = new FaqItemEntity();
    entity.id = item.id;
    entity.question = item.question;
    entity.answer = item.answer;
    entity.sortOrder = item.sortOrder;
    entity.isActive = item.isActive;
    entity.createdAt = item.createdAt;
    entity.updatedAt = item.updatedAt;
    return entity;
  }
}
