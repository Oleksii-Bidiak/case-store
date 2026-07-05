import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ContactMessageStatus } from '@prisma/client';
import { ContactRepository } from './contact.repository';
import { ContactMessageEntity } from './entities';
import {
  CreateContactMessageDto,
  ContactMessageListQueryDto,
  UpdateContactMessageDto,
} from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * Pagination metadata returned alongside inbox lists.
 */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Response shape for the admin inbox: the page of messages, pagination
 * metadata, and the current unread (NEW) count for the sidebar badge.
 */
export interface ContactInboxResult {
  data: ContactMessageEntity[];
  meta: PaginationMeta & { unread: number };
}

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
  ) {
    this.logger.setContext(ContactService.name);
  }

  /**
   * Persist a new contact message from the public storefront form. Inputs are
   * already trimmed by the DTO transform; the message is created in the NEW
   * state. Returns the created entity — the controller narrows the public
   * response to `{ id }` so no stored PII is echoed back.
   */
  async create(dto: CreateContactMessageDto): Promise<ContactMessageEntity> {
    const message = await this.contactRepository.create({
      name: dto.name,
      phone: dto.phone,
      email: dto.email,
      message: dto.message,
      topic: dto.topic ?? null,
      orderRef: dto.orderRef ?? null,
    });

    this.logger.info(
      { contactMessageId: message.id, topic: message.topic },
      'Contact message received',
    );
    return ContactMessageEntity.fromPrisma(message);
  }

  /**
   * List messages for the admin inbox (paginated, optional status filter,
   * newest first) together with the current unread (NEW) count.
   */
  async findAllAdmin(query: ContactMessageListQueryDto): Promise<ContactInboxResult> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const [{ messages, total }, unread] = await Promise.all([
      this.contactRepository.findAll({ page, limit, status: query.status }),
      this.contactRepository.countByStatus(ContactMessageStatus.NEW),
    ]);

    return {
      data: messages.map((row) => ContactMessageEntity.fromPrisma(row)),
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
    return ContactMessageEntity.fromPrisma(message);
  }

  /**
   * Current unread (NEW) message count — for the admin sidebar badge.
   */
  async unreadCount(): Promise<number> {
    return this.contactRepository.countByStatus(ContactMessageStatus.NEW);
  }

  /**
   * Apply an admin update: change status (NEW/READ/ARCHIVED) and/or set the
   * internal admin note. Throws NotFoundException when the message is missing.
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
    return ContactMessageEntity.fromPrisma(updated);
  }
}
