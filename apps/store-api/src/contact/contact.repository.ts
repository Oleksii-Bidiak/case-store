import { Injectable } from '@nestjs/common';
import { ContactMessage, ContactMessageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { CONTACT_MESSAGE_SORT_FIELDS } from './dto';
import type { ContactMessageSortField } from './dto';

/**
 * Raised by {@link ContactRepository.setStatusMany} when the batch names a
 * message that no longer exists, so the transaction rolls back instead of
 * half-applying.
 *
 * A domain error, not a `NotFoundException`: repositories in this codebase do
 * not speak HTTP. `ContactService` maps it.
 */
export class ContactMessagesNotFoundError extends Error {
  constructor(readonly missingIds: string[]) {
    super(`Unknown contact message id(s): ${missingIds.join(', ')}`);
    this.name = 'ContactMessagesNotFoundError';
  }
}

const DEFAULT_SORT_BY: ContactMessageSortField = 'createdAt';

/**
 * Translate the DTO's sort choice into a Prisma `orderBy` (TASK-354).
 *
 * `id` is always the last tiebreaker. `status` and `name` are non-unique, and
 * Postgres is free to return tied rows in a different order on every query;
 * paginating over an unstable ordering makes rows show up on two pages and
 * others on none — a message would appear to vanish from the inbox without
 * anyone having touched it.
 *
 * The `sortBy` value is already allow-listed by `@IsIn` at the boundary; the
 * fallback here is the defensive default for internal callers.
 */
function buildContactOrderBy(
  sortBy: ContactMessageSortField | undefined,
  sortOrder: 'asc' | 'desc' | undefined,
): Prisma.ContactMessageOrderByWithRelationInput[] {
  const order = sortOrder ?? 'desc';
  const field = sortBy && CONTACT_MESSAGE_SORT_FIELDS.includes(sortBy) ? sortBy : DEFAULT_SORT_BY;

  return [{ [field]: order }, { id: 'asc' }];
}

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
  sortBy?: ContactMessageSortField;
  sortOrder?: 'asc' | 'desc';
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
   * List messages for the admin inbox — paginated, optional status filter,
   * newest first unless the caller asks otherwise (TASK-354). Returns the page
   * of rows plus the total for pagination.
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
        orderBy: buildContactOrderBy(params.sortBy, params.sortOrder),
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
   * Write one status onto exactly the named messages (TASK-354), in one
   * transaction.
   *
   * All-or-nothing: an id that no longer exists aborts the batch before any
   * write. That case is not hypothetical on a shared inbox — it is what a
   * colleague archiving the same message a second earlier looks like — and a
   * partial write would leave the operator's selection and the inbox disagreeing
   * with nothing on screen to say which half landed.
   *
   * Assumes `ids` is already distinct (the service dedupes): the missing-id check
   * compares counts, so a repeated id would read as an unknown one.
   *
   * Returns how many rows the database wrote.
   */
  async setStatusMany(ids: string[], status: ContactMessageStatus): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.contactMessage.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });

      if (found.length !== ids.length) {
        const known = new Set(found.map((row) => row.id));
        throw new ContactMessagesNotFoundError(ids.filter((id) => !known.has(id)));
      }

      const { count } = await tx.contactMessage.updateMany({
        where: { id: { in: ids } },
        data: { status },
      });

      return count;
    });
  }

  /**
   * Count messages in the NEW (unread) state — powers the admin sidebar badge.
   */
  countByStatus(status: ContactMessageStatus): Promise<number> {
    return this.prisma.contactMessage.count({ where: { status } });
  }

  /**
   * Resolve the id of the registered (non-soft-deleted) user whose email matches
   * a message sender, or null (TASK-256). Live read-time lookup — deliberately
   * not a persisted FK, so it "catches up" when a sender registers later.
   * Cross-domain read of `prisma.user` from the contact module — mirror image of
   * UserRepository.getContactMessagesByEmail (TASK-252), same rationale.
   */
  async findMatchingUserId(email: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  /**
   * Batched variant for list pages (TASK-256): one `email IN (...)` query for
   * the whole page, reduced to a Map of email → user id. Skips the query
   * entirely for an empty input.
   */
  async findMatchingUserIds(emails: string[]): Promise<Map<string, string>> {
    if (emails.length === 0) {
      return new Map();
    }
    const users = await this.prisma.user.findMany({
      where: { email: { in: emails }, deletedAt: null },
      select: { id: true, email: true },
    });
    return new Map(users.map((user) => [user.email, user.id]));
  }
}
