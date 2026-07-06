import { Injectable } from '@nestjs/common';
import { FaqItem } from '@prisma/client';
import { PrismaService } from '../prisma';

/**
 * Allowed fields for creating a FAQ item. `sortOrder`/`isActive` fall back to
 * their column defaults when omitted.
 */
export interface CreateFaqItemInput {
  question: string;
  answer: string;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * Allowed fields for updating a FAQ item. Only provided fields are written.
 */
export interface UpdateFaqItemInput {
  question?: string;
  answer?: string;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * Repository encapsulating all Prisma access for the FaqItem model (TASK-242).
 * Services depend on this class — never on PrismaClient directly.
 */
@Injectable()
export class FaqRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all active FAQ items ordered by sortOrder (ascending), then createdAt
   * for a stable order among equal ranks. Backs the public `GET /api/faq`.
   */
  findAllActive(): Promise<FaqItem[]> {
    return this.prisma.faqItem.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * List every FAQ item (any status) ordered by sortOrder. Backs the admin list.
   */
  findAllAdmin(): Promise<FaqItem[]> {
    return this.prisma.faqItem.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Find a FAQ item by ID. Returns the record or null if not found.
   */
  findById(id: string): Promise<FaqItem | null> {
    return this.prisma.faqItem.findUnique({ where: { id } });
  }

  /**
   * Create a new FAQ item. `sortOrder` and `isActive` default to 0 / true.
   */
  create(data: CreateFaqItemInput): Promise<FaqItem> {
    return this.prisma.faqItem.create({
      data: {
        question: data.question,
        answer: data.answer,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  }

  /**
   * Update a FAQ item's fields. Only provided fields are written.
   */
  update(id: string, data: UpdateFaqItemInput): Promise<FaqItem> {
    return this.prisma.faqItem.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a FAQ item permanently. (FAQ has no audit-tombstone requirement —
   * removing a question is a plain delete, unlike User/Product/Order.)
   */
  delete(id: string): Promise<FaqItem> {
    return this.prisma.faqItem.delete({ where: { id } });
  }
}
