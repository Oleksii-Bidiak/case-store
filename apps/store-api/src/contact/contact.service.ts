import { Injectable, NotFoundException } from '@nestjs/common';
import { RetryAfterException } from '../common/filters/retry-after.exception';
import { PinoLogger } from 'nestjs-pino';
import { ContactMessageStatus } from '@prisma/client';
import {
  ContactMessagesNotFoundError,
  ContactRepository,
  type CreateContactMessageInput,
} from './contact.repository';
import { ContactMessageEntity } from './entities';
import type { Paginated, PaginationMeta } from '../common/pagination';
// Direct path, not the barrel: the barrel pulls in NotificationModule itself.
import { ShopNotifier } from '../notification/shop-notifier.service';
import {
  CreateContactMessageDto,
  ContactMessageListQueryDto,
  UpdateContactMessageDto,
} from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * One message per email per this window (TASK-452), on top of the controller's
 * 5/min per-IP `@Throttle`. The two limits answer different abuse: the IP cap
 * stops one machine hammering the form, this one stops a single address being
 * used to flood the inbox from many machines — and stops a real customer's
 * double-click or impatient resend from landing as two tickets.
 */
export const CONTACT_EMAIL_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * The `error` code of the cooldown 429. The storefront keys its copy off it,
 * because a 429 alone is ambiguous: the per-IP throttler answers 429 too, and
 * "wait a minute" is the wrong thing to tell someone who must wait ten.
 */
export const CONTACT_COOLDOWN_ERROR = 'CONTACT_COOLDOWN';

/**
 * What the public submit returns — only the id, never the stored PII.
 */
export interface ContactSubmissionResult {
  id: string;
}

/**
 * One page of the admin inbox: the messages, pagination metadata, and the current
 * unread (NEW) count for the sidebar badge.
 */
export type ContactInboxPage = Paginated<ContactMessageEntity, PaginationMeta & { unread: number }>;

/**
 * ContactService — business logic for customer contact messages (TASK-177).
 *
 * The service never touches Prisma directly — all persistence goes through
 * {@link ContactRepository}. Message bodies are stored as plain text; no HTML
 * sanitisation runs here (the frontend escapes on render).
 */
@Injectable()
export class ContactService {
  constructor(
    private readonly contactRepository: ContactRepository,
    private readonly logger: PinoLogger,
    private readonly shopNotifier: ShopNotifier,
  ) {
    this.logger.setContext(ContactService.name);
  }

  /**
   * The public storefront submit (TASK-452): the anti-spam rules, then
   * {@link create}.
   *
   * 1. **Honeypot.** A non-empty `website` is a bot — or a false positive. It
   *    gets the success answer with the id of a row stored as `SPAM` (TASK-761;
   *    until then nothing was written, so a false positive left no trace). The
   *    cooldown is skipped for it, in both directions.
   * 2. **Per-email cooldown.** A second message from the same address (compared
   *    trimmed and lower-cased) inside {@link CONTACT_EMAIL_COOLDOWN_MS} is a
   *    429 with `error: 'CONTACT_COOLDOWN'`.
   *
   * The cooldown is a read-then-write, so two requests racing in the same
   * instant can both pass. Accepted: the per-IP throttle still caps the burst,
   * and the cost of the miss is one extra ticket — not worth a lock or a unique
   * constraint on an inbox.
   */
  async submit(dto: CreateContactMessageDto): Promise<ContactSubmissionResult> {
    const { website, ...message } = dto;

    if (website) {
      // TASK-761: KEPT, as a SPAM row, instead of thrown away. A silent drop
      // made a false positive — a password manager or a Chrome heuristic that
      // starts filling the trap — invisible by design: every message from that
      // browser would vanish forever and nothing would say so. The row sits
      // outside the default inbox and the unread count, behind the «Спам» filter.
      //
      // The sender still gets the ordinary success answer, and the cooldown is
      // neither checked nor fed (SPAM rows are excluded from its probe): a bot
      // using a real person's address must not lock that person out.
      const spam = await this.contactRepository.create({
        ...this.toCreateInput(message),
        status: ContactMessageStatus.SPAM,
        adminNote: `Honeypot: «${website.slice(0, 255)}»`,
      });
      // No name/email/phone in the log line: this is a bot's payload, and it is
      // also possibly a real person's address a bot is abusing.
      this.logger.info(
        { contactMessageId: spam.id, topic: dto.topic ?? null },
        'Contact honeypot tripped — stored as SPAM',
      );
      return { id: spam.id };
    }

    const email = dto.email.trim().toLowerCase();
    // TASK-763: the age comes from the database clock (see the repository), and
    // a negative age — a row stamped in the future by a skewed writer — counts
    // as "just now", so no sender is ever held for longer than the window.
    const ageMs = await this.contactRepository.findLatestMessageAgeMsByEmail(email);
    const remainingMs = ageMs === null ? 0 : CONTACT_EMAIL_COOLDOWN_MS - Math.max(0, ageMs);
    if (remainingMs > 0) {
      // TASK-762: the REAL remaining wait, not the full window. The copy used to
      // promise "10 minutes from now" to someone who might have one second left.
      const retryAfterSeconds = Math.ceil(remainingMs / 1000);
      throw new RetryAfterException({
        error: CONTACT_COOLDOWN_ERROR,
        message: `A message from this email was received recently. Try again in ${retryAfterSeconds} s.`,
        retryAfterSeconds,
      });
    }

    const created = await this.create(message);
    return { id: created.id };
  }

  /**
   * Persist a new contact message from the public storefront form. Inputs are
   * already trimmed by the DTO transform; the message is created in the NEW
   * state. Returns the created entity — the controller narrows the public
   * response to `{ id }` so no stored PII is echoed back.
   */
  async create(dto: CreateContactMessageDto): Promise<ContactMessageEntity> {
    // TASK-677: the shop's Telegram ping is queued in the message's own
    // transaction. Only this path passes the hook — every row it writes is NEW;
    // the honeypot's SPAM row in `submit` goes straight to the repository and
    // never pings.
    const message = await this.contactRepository.create(
      this.toCreateInput(dto),
      async (tx, created) => {
        await this.shopNotifier.enqueueContactMessage(
          {
            messageId: created.id,
            name: created.name,
            phone: created.phone,
            email: created.email,
            topic: created.topic,
            orderRef: created.orderRef,
            message: created.message,
          },
          tx,
        );
      },
    );

    this.logger.info(
      { contactMessageId: message.id, topic: message.topic },
      'Contact message received',
    );
    return ContactMessageEntity.fromPrisma(message);
  }

  /** The stored fields of a message — the honeypot never among them. */
  private toCreateInput(dto: Omit<CreateContactMessageDto, 'website'>): CreateContactMessageInput {
    return {
      name: dto.name,
      phone: dto.phone,
      email: dto.email,
      message: dto.message,
      topic: dto.topic ?? null,
      orderRef: dto.orderRef ?? null,
    };
  }

  /**
   * List messages for the admin inbox (paginated, optional status filter,
   * newest first) together with the current unread (NEW) count.
   */
  async findAllAdmin(query: ContactMessageListQueryDto): Promise<ContactInboxPage> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const [{ messages, total }, unread] = await Promise.all([
      this.contactRepository.findAll({
        page,
        limit,
        status: query.status,
        search: query.search,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      }),
      this.contactRepository.countByStatus(ContactMessageStatus.NEW),
    ]);

    // TASK-256: one batched sender→user match per page (distinct emails), never N+1.
    const distinctEmails = [...new Set(messages.map((row) => row.email))];
    const matchMap = await this.contactRepository.findMatchingUserIds(distinctEmails);

    return {
      items: messages.map((row) =>
        ContactMessageEntity.fromPrisma(row, matchMap.get(row.email) ?? null),
      ),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit), unread },
    };
  }

  /**
   * Get a single message by id (admin). Throws NotFoundException when absent.
   */
  async findByIdAdmin(id: string): Promise<ContactMessageEntity> {
    const message = await this.contactRepository.findById(id);
    if (!message) {
      throw new NotFoundException('Contact message not found');
    }
    // TASK-256: live sender→user match so the inbox can link to the profile.
    const matchedUserId = await this.contactRepository.findMatchingUserId(message.email);
    return ContactMessageEntity.fromPrisma(message, matchedUserId);
  }

  /**
   * Current unread (NEW) message count — for the admin sidebar badge.
   */
  async unreadCount(): Promise<number> {
    return this.contactRepository.countByStatus(ContactMessageStatus.NEW);
  }

  /**
   * Apply an admin update: change status (NEW/IN_PROGRESS/READ/ARCHIVED) and/or
   * set the internal admin note. Throws NotFoundException when the message is
   * missing.
   */
  async update(id: string, dto: UpdateContactMessageDto): Promise<ContactMessageEntity> {
    const existing = await this.contactRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Contact message not found');
    }

    const updated = await this.contactRepository.update(id, {
      status: dto.status,
      adminNote: dto.adminNote,
    });

    this.logger.info({ contactMessageId: id, status: updated.status }, 'Contact message updated');
    // TASK-256: the email is immutable on update — resolve the match for the response.
    const matchedUserId = await this.contactRepository.findMatchingUserId(updated.email);
    return ContactMessageEntity.fromPrisma(updated, matchedUserId);
  }

  /**
   * Write one status onto many messages at once (TASK-354) — the per-row status
   * change applied to the operator's selection, in one transaction.
   *
   * Side-effect parity with {@link update} is what makes this safe to ship: that
   * path writes the row and logs, and nothing else. The unread badge is a live
   * `COUNT(*)` (see {@link unreadCount}) with no cache in front of it, so there
   * is nothing to evict here — the next badge read is already correct. If a cache
   * is ever put in front of that count, it has to be evicted from BOTH paths.
   *
   * Returns how many rows were written, not how many were asked for.
   *
   * @throws NotFoundException when any id is unknown — nothing is written.
   */
  async updateStatusMany(ids: string[], status: ContactMessageStatus): Promise<number> {
    // The selection comes from a checkbox grid, so a repeated id is a UI slip,
    // not a request to write twice — and the repository's all-or-nothing check
    // compares counts, which a duplicate would turn into a spurious 404.
    const uniqueIds = [...new Set(ids)];

    let count: number;
    try {
      count = await this.contactRepository.setStatusMany(uniqueIds, status);
    } catch (error) {
      if (error instanceof ContactMessagesNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }

    this.logger.info(
      { contactMessageIds: uniqueIds, status, count },
      'Contact messages updated in bulk',
    );

    return count;
  }
}
