import { Injectable } from '@nestjs/common';
import { ContactMessage, ContactMessageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';

/**
 * Allowed fields for creating a contact message. `status` is always NEW on
 * insert (the DB default) — never accepted from the caller.
 */
export interface CreateContactMessageInput {
  name: string;
  phone: string;
  email: string;
  message: string;
  topic?: string | null;
  orderRef?: string | null;
}

/**
 * Fields an admin may update on a contact message. Only provided keys are
 * written (a partial patch).
 */
export interface UpdateContactMessageInput {
  status?: ContactMessageStatus;
  adminNote?: string | null;
}

/**
 * Parameters for the admin inbox list.
 */
export interface FindAllParams {
  page: number;
  limit: number;
  status?: ContactMessageStatus;
}

/**
 * Result of a paginated contact-message query.
 */
export interface PaginatedContactMessagesResult {
  messages: ContactMessage[];
  total: number;
}

/**
 * ContactRepository — all Prisma access for the ContactMessage model lives here
 * (Clean Architecture: services never touch PrismaClient directly).
 */
@Injectable()
export class ContactRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert a new contact message. Status defaults to NEW at the DB level.
   */
  create(data: CreateContactMessageInput): Promise<ContactMessage> {
    return this.prisma.contactMessage.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        message: data.message,
        topic: data.topic ?? null,
        orderRef: data.orderRef ?? null,
      },
    });
  }

  /**
   * List messages for the admin inbox, newest first, paginated, with an optional
   * status filter. Returns the page of rows plus the total for pagination.
   */
  async findAll(params: FindAllParams): Promise<PaginatedContactMessagesResult> {
    const { page, limit, status } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.ContactMessageWhereInput = {
      ...(status !== undefined && { status }),
    };

    const [messages, total] = await Promise.all([
      this.prisma.contactMessage.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contactMessage.count({ where }),
    ]);

    return { messages, total };
  }

  /**
   * Find a single message by id (admin). Returns null when absent.
   */
  findById(id: string): Promise<ContactMessage | null> {
    return this.prisma.contactMessage.findUnique({ where: { id } });
  }

  /**
   * Apply a partial update (status and/or admin note) to a message.
   */
  update(id: string, data: UpdateContactMessageInput): Promise<ContactMessage> {
    return this.prisma.contactMessage.update({
      where: { id },
      data: {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.adminNote !== undefined && { adminNote: data.adminNote }),
      },
    });
  }

  /**
   * Count messages in the NEW (unread) state — powers the admin sidebar badge.
   */
  countByStatus(status: ContactMessageStatus): Promise<number> {
    return this.prisma.contactMessage.count({ where: { status } });
  }
}
