import { Injectable } from '@nestjs/common';
import { ContactMessage, ContactMessageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { normalizeUaPhone, phoneDigits } from '../common/validators';
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
 * How many digits a search term must carry before the inbox treats it as a phone
 * number (TASK-423). Same guard, same number and the same reason as
 * `OrderRepository.SEARCH_PHONE_MIN_DIGITS` — see the call site.
 */
const SEARCH_PHONE_MIN_DIGITS = 3;

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
 * Allowed fields for creating a contact message. `status` is NEW on insert (the
 * DB default) unless the SERVICE says otherwise — it is never taken from the
 * request; the one other value written here is `SPAM` for a honeypot hit
 * (TASK-761), with a note saying why.
 */
export interface CreateContactMessageInput {
  name: string;
  phone: string;
  email: string;
  message: string;
  topic?: string | null;
  orderRef?: string | null;
  status?: ContactMessageStatus;
  adminNote?: string | null;
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
  /** Free-text needle — see {@link ContactRepository.findAll} (TASK-423). */
  search?: string;
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
   *
   * @param afterCreate optional in-transaction hook (TASK-677): when given, the
   *   insert and the hook run in ONE `$transaction`, so whatever the hook writes
   *   (the shop's Telegram ping) commits with the message or not at all, and a
   *   throwing hook rolls the message back. Without it this stays a single plain
   *   insert, as before — no transaction is opened for the SPAM path.
   */
  create(
    data: CreateContactMessageInput,
    afterCreate?: (tx: Prisma.TransactionClient, created: ContactMessage) => Promise<void>,
  ): Promise<ContactMessage> {
    const args = {
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        message: data.message,
        topic: data.topic ?? null,
        orderRef: data.orderRef ?? null,
        ...(data.status !== undefined && { status: data.status }),
        ...(data.adminNote !== undefined && { adminNote: data.adminNote }),
      },
    } satisfies Prisma.ContactMessageCreateArgs;

    if (!afterCreate) {
      return this.prisma.contactMessage.create(args);
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.contactMessage.create(args);
      await afterCreate(tx, created);
      return created;
    });
  }

  /**
   * List messages for the admin inbox — paginated, optional status filter,
   * newest first unless the caller asks otherwise (TASK-354). Returns the page
   * of rows plus the total for pagination.
   */
  async findAll(params: FindAllParams): Promise<PaginatedContactMessagesResult> {
    const { page, limit, status, search } = params;
    const skip = (page - 1) * limit;
    // TASK-761: "all" means all the MAIL — honeypot hits are kept for the record
    // but reached only by asking for them (`?status=SPAM`), or a burst of bot
    // traffic would bury the inbox it was kept out of.
    const where: Prisma.ContactMessageWhereInput = {
      status: status !== undefined ? status : { not: ContactMessageStatus.SPAM },
    };

    // TASK-423: the inbox had no search. Every column an operator would look
    // something up by is a plain string on this one table — no joins needed — so
    // the arms are simply all of them, OR-ed and case-insensitive, mirroring
    // `OrderRepository.findAllForAdmin`.
    //
    // `message` is in the list on purpose, unlike the SORT allow-list which
    // deliberately excludes it: ordering a queue by the text of the message is
    // not a triage anyone performs, but "the message that mentioned a broken
    // charger" is exactly how an operator remembers it.
    if (search) {
      const or: Prisma.ContactMessageWhereInput[] = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { topic: { contains: search, mode: 'insensitive' } },
        { orderRef: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
      ];

      // `ContactMessage.phone` is stored NORMALISED (`380XXXXXXXXX`, see
      // `CreateContactMessageDto`), so the term has to be normalised the same way
      // or the operator typing the number the way the customer dictates it —
      // `067 123 45 67` — finds nothing at all. This is the TASK-466 fix applied
      // to the second table that has the same shape.
      //
      // Guarded on the digit count: `normalizeUaPhone('Іван')` is `''`, and
      // `{ contains: '' }` matches EVERY row — a name search would silently
      // become "show me the whole inbox".
      if (phoneDigits(search).length >= SEARCH_PHONE_MIN_DIGITS) {
        or.push({ phone: { contains: normalizeUaPhone(search) } });
      }

      where.OR = or;
    }

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
   * How long ago, in milliseconds, did this email last write to us — measured
   * by the DATABASE clock? Null for a first-time sender. Feeds the per-email
   * cooldown in `ContactService.submit` (TASK-452); the rule lives there, this
   * is the read.
   *
   * TASK-763, three changes from the first version:
   *
   * - **Exact match.** `email` has been stored `lower(trim())` since TASK-772,
   *   and migration `20260926130000_contact_message_email_index` folded the rows
   *   that predate it, so `mode: 'insensitive'` (an `ILIKE` no b-tree can serve)
   *   bought nothing but a sequential scan on every public POST. The caller
   *   passes the normalised address.
   * - **An index.** `@@index([email, createdAt(sort: Desc)])` answers
   *   `WHERE email = $1 ORDER BY created_at DESC LIMIT 1` from one index probe.
   * - **One clock.** The window used to be `Date.now()` on this app instance
   *   against a `createdAt` stamped by whichever instance (or database) wrote
   *   the row; a few minutes of skew and a `createdAt` from the future refused a
   *   sender for longer than the window. The age is now computed in SQL against
   *   `now()` — `AT TIME ZONE 'UTC'` because the column is a zone-less
   *   timestamp Prisma writes in UTC. The service still clamps a negative age.
   *
   * `SPAM` rows (TASK-761) never count: a bot that put a real person's address
   * into the form must not lock that person out of it for ten minutes.
   */
  async findLatestMessageAgeMsByEmail(email: string): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<Array<{ age_ms: number }>>`
      SELECT (EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'UTC') - created_at)) * 1000)::float8 AS age_ms
        FROM contact_messages
       WHERE email = ${email}
         AND status <> 'SPAM'
       ORDER BY created_at DESC
       LIMIT 1`;
    return rows.length > 0 ? Number(rows[0].age_ms) : null;
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
