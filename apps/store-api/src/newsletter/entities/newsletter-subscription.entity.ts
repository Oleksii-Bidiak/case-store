import { ApiProperty } from '@nestjs/swagger';
import { NewsletterStatus } from '@prisma/client';

/**
 * Domain entity representing a newsletter subscriber.
 *
 * Clean domain entity (not a Prisma model) returned by NewsletterService admin
 * methods. The public subscribe endpoint never returns this — it only confirms
 * `{ subscribed: true }` so a subscriber's stored data is not echoed back.
 */
export class NewsletterSubscriptionEntity {
  @ApiProperty({
    description: 'Subscription unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Subscriber email (normalized lowercase)',
    example: 'user@example.com',
  })
  email!: string;

  @ApiProperty({
    description: 'Subscription lifecycle state',
    enum: NewsletterStatus,
    example: NewsletterStatus.SUBSCRIBED,
  })
  status!: NewsletterStatus;

  @ApiProperty({
    description: 'Where the opt-in came from (e.g. home, promo, blog)',
    example: 'home',
    type: String,
    nullable: true,
    required: false,
  })
  source!: string | null;

  @ApiProperty({ description: 'Creation timestamp', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({
    description: 'When the subscriber last unsubscribed (null while SUBSCRIBED)',
    example: '2026-02-01T00:00:00.000Z',
    type: String,
    format: 'date-time',
    nullable: true,
    required: false,
  })
  unsubscribedAt!: Date | null;

  /**
   * Create a NewsletterSubscriptionEntity from a Prisma NewsletterSubscription model.
   */
  static fromPrisma(row: {
    id: string;
    email: string;
    status: NewsletterStatus;
    source: string | null;
    createdAt: Date;
    updatedAt: Date;
    unsubscribedAt: Date | null;
  }): NewsletterSubscriptionEntity {
    const entity = new NewsletterSubscriptionEntity();
    entity.id = row.id;
    entity.email = row.email;
    entity.status = row.status;
    entity.source = row.source;
    entity.createdAt = row.createdAt;
    entity.updatedAt = row.updatedAt;
    entity.unsubscribedAt = row.unsubscribedAt;
    return entity;
  }
}
