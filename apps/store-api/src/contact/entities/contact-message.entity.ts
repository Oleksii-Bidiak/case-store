import { ApiProperty } from '@nestjs/swagger';
import { ContactMessageStatus } from '@prisma/client';

/**
 * Domain entity for a customer contact message (TASK-177).
 *
 * Clean domain entity (not a Prisma model) returned by ContactService admin
 * methods. The public POST endpoint deliberately returns only `{ id }` — it
 * never echoes stored PII back to the submitter.
 */
export class ContactMessageEntity {
  @ApiProperty({
    description: 'Message unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Sender full name', example: 'Ivan Petrenko' })
  name!: string;

  @ApiProperty({ description: 'Contact phone number', example: '+380671234567' })
  phone!: string;

  @ApiProperty({ description: 'Contact email address', example: 'ivan@example.com' })
  email!: string;

  @ApiProperty({
    description: 'Topic key selected on the form',
    example: 'order',
    type: String,
    nullable: true,
    required: false,
  })
  topic!: string | null;

  @ApiProperty({
    description: 'Order reference typed in by the customer',
    example: 'ORD-10231',
    type: String,
    nullable: true,
    required: false,
  })
  orderRef!: string | null;

  @ApiProperty({
    description: 'Message body (plain text)',
    example: 'Доброго дня! Хотів би дізнатись про наявність...',
  })
  message!: string;

  @ApiProperty({
    description: 'Moderation / handling status',
    enum: ContactMessageStatus,
    example: ContactMessageStatus.NEW,
  })
  status!: ContactMessageStatus;

  @ApiProperty({
    description: 'Internal admin note',
    example: 'Called back, resolved.',
    type: String,
    nullable: true,
    required: false,
  })
  adminNote!: string | null;

  @ApiProperty({
    description:
      'Id of the registered user whose email matches the sender (TASK-256). ' +
      'Resolved live at read time (admin endpoints only) — null when the sender ' +
      'is not a registered user or on the public create response.',
    example: '550e8400-e29b-41d4-a716-446655440001',
    type: String,
    nullable: true,
    required: false,
  })
  matchedUserId!: string | null;

  @ApiProperty({ description: 'Creation timestamp', example: '2026-07-05T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2026-07-05T10:00:00.000Z' })
  updatedAt!: Date;

  /**
   * Build a ContactMessageEntity from a Prisma ContactMessage row.
   *
   * `matchedUserId` (TASK-256) defaults to null so the public create path keeps
   * calling `fromPrisma(row)` unchanged — only admin reads resolve a match.
   */
  static fromPrisma(
    row: {
      id: string;
      name: string;
      phone: string;
      email: string;
      topic: string | null;
      orderRef: string | null;
      message: string;
      status: ContactMessageStatus;
      adminNote: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    matchedUserId: string | null = null,
  ): ContactMessageEntity {
    const entity = new ContactMessageEntity();
    entity.id = row.id;
    entity.name = row.name;
    entity.phone = row.phone;
    entity.email = row.email;
    entity.topic = row.topic;
    entity.orderRef = row.orderRef;
    entity.message = row.message;
    entity.status = row.status;
    entity.adminNote = row.adminNote;
    entity.matchedUserId = matchedUserId;
    entity.createdAt = row.createdAt;
    entity.updatedAt = row.updatedAt;
    return entity;
  }
}
