import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ContactMessage, ContactMessageStatus } from '@prisma/client';
import { ContactRepository } from './contact.repository';
import { ContactService } from './contact.service';

const now = new Date('2026-07-05T10:00:00.000Z');

const makeMessage = (overrides: Partial<ContactMessage> = {}): ContactMessage => ({
  id: 'msg-uuid-1',
  name: 'Ivan Petrenko',
  phone: '+380671234567',
  email: 'ivan@example.com',
  topic: 'order',
  orderRef: 'ORD-10231',
  message: 'Доброго дня! Питання по замовленню.',
  status: ContactMessageStatus.NEW,
  adminNote: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const contactRepositoryMock = {
  create: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  countByStatus: jest.fn(),
  findMatchingUserId: jest.fn(),
  findMatchingUserIds: jest.fn(),
};

const pinoLoggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

describe('ContactService', () => {
  let service: ContactService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // TASK-256 defaults: no registered user matches unless a test arms these.
    contactRepositoryMock.findMatchingUserId.mockResolvedValue(null);
    contactRepositoryMock.findMatchingUserIds.mockResolvedValue(new Map());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactService,
        { provide: ContactRepository, useValue: contactRepositoryMock },
        { provide: PinoLogger, useValue: pinoLoggerMock },
      ],
    }).compile();

    service = module.get<ContactService>(ContactService);
  });

  describe('create', () => {
    it('persists the message and returns an entity', async () => {
      const created = makeMessage();
      contactRepositoryMock.create.mockResolvedValue(created);

      const result = await service.create({
        name: 'Ivan Petrenko',
        phone: '+380671234567',
        email: 'ivan@example.com',
        message: 'Доброго дня! Питання по замовленню.',
        topic: 'order',
        orderRef: 'ORD-10231',
      });

      expect(result.id).toBe('msg-uuid-1');
      expect(result.status).toBe(ContactMessageStatus.NEW);
      expect(contactRepositoryMock.create).toHaveBeenCalledWith({
        name: 'Ivan Petrenko',
        phone: '+380671234567',
        email: 'ivan@example.com',
        message: 'Доброго дня! Питання по замовленню.',
        topic: 'order',
        orderRef: 'ORD-10231',
      });
    });

    it('defaults optional topic/orderRef to null', async () => {
      contactRepositoryMock.create.mockResolvedValue(makeMessage({ topic: null, orderRef: null }));

      await service.create({
        name: 'Ivan',
        phone: '+380671234567',
        email: 'ivan@example.com',
        message: 'A message body long enough',
      });

      expect(contactRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ topic: null, orderRef: null }),
      );
    });

    it('returns matchedUserId: null with zero user-lookup calls (TASK-256: write path stays lean)', async () => {
      contactRepositoryMock.create.mockResolvedValue(makeMessage());

      const result = await service.create({
        name: 'Ivan Petrenko',
        phone: '+380671234567',
        email: 'ivan@example.com',
        message: 'Доброго дня! Питання по замовленню.',
      });

      expect(result.matchedUserId).toBeNull();
      expect(contactRepositoryMock.findMatchingUserId).not.toHaveBeenCalled();
      expect(contactRepositoryMock.findMatchingUserIds).not.toHaveBeenCalled();
    });
  });

  describe('findAllAdmin', () => {
    it('returns entities plus pagination meta and the unread count', async () => {
      contactRepositoryMock.findAll.mockResolvedValue({ messages: [makeMessage()], total: 1 });
      contactRepositoryMock.countByStatus.mockResolvedValue(3);

      const result = await service.findAllAdmin({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1, unread: 3 });
      expect(contactRepositoryMock.countByStatus).toHaveBeenCalledWith(ContactMessageStatus.NEW);
    });

    it('passes the status filter through to the repository', async () => {
      contactRepositoryMock.findAll.mockResolvedValue({ messages: [], total: 0 });
      contactRepositoryMock.countByStatus.mockResolvedValue(0);

      await service.findAllAdmin({ page: 2, limit: 10, status: ContactMessageStatus.READ });

      expect(contactRepositoryMock.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        status: ContactMessageStatus.READ,
      });
    });

    it('attaches matchedUserId per row via ONE batched lookup over distinct emails (TASK-256)', async () => {
      const rows = [
        makeMessage({ id: 'msg-1', email: 'ivan@example.com' }),
        makeMessage({ id: 'msg-2', email: 'guest@example.com' }),
        makeMessage({ id: 'msg-3', email: 'ivan@example.com' }),
      ];
      contactRepositoryMock.findAll.mockResolvedValue({ messages: rows, total: 3 });
      contactRepositoryMock.countByStatus.mockResolvedValue(0);
      contactRepositoryMock.findMatchingUserIds.mockResolvedValue(
        new Map([['ivan@example.com', 'user-uuid-1']]),
      );

      const result = await service.findAllAdmin({ page: 1, limit: 20 });

      expect(result.data.map((m) => m.matchedUserId)).toEqual(['user-uuid-1', null, 'user-uuid-1']);
      // One batched call per page — never N+1, and only distinct emails.
      expect(contactRepositoryMock.findMatchingUserIds).toHaveBeenCalledTimes(1);
      expect(contactRepositoryMock.findMatchingUserIds).toHaveBeenCalledWith([
        'ivan@example.com',
        'guest@example.com',
      ]);
      expect(contactRepositoryMock.findMatchingUserId).not.toHaveBeenCalled();
    });
  });

  describe('findByIdAdmin', () => {
    it('returns the entity when found', async () => {
      contactRepositoryMock.findById.mockResolvedValue(makeMessage());

      const result = await service.findByIdAdmin('msg-uuid-1');

      expect(result.id).toBe('msg-uuid-1');
    });

    it('throws NotFoundException when absent', async () => {
      contactRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.findByIdAdmin('missing')).rejects.toThrow(NotFoundException);
    });

    it('attaches matchedUserId via the single-email lookup (TASK-256)', async () => {
      contactRepositoryMock.findById.mockResolvedValue(makeMessage());
      contactRepositoryMock.findMatchingUserId.mockResolvedValue('user-uuid-1');

      const result = await service.findByIdAdmin('msg-uuid-1');

      expect(result.matchedUserId).toBe('user-uuid-1');
      expect(contactRepositoryMock.findMatchingUserId).toHaveBeenCalledWith('ivan@example.com');
    });

    it('returns matchedUserId: null when the sender is not a registered user', async () => {
      contactRepositoryMock.findById.mockResolvedValue(makeMessage());
      contactRepositoryMock.findMatchingUserId.mockResolvedValue(null);

      const result = await service.findByIdAdmin('msg-uuid-1');

      expect(result.matchedUserId).toBeNull();
    });
  });

  describe('update', () => {
    it('transitions status NEW → READ', async () => {
      contactRepositoryMock.findById.mockResolvedValue(makeMessage());
      contactRepositoryMock.update.mockResolvedValue(
        makeMessage({ status: ContactMessageStatus.READ }),
      );

      const result = await service.update('msg-uuid-1', { status: ContactMessageStatus.READ });

      expect(result.status).toBe(ContactMessageStatus.READ);
      expect(contactRepositoryMock.update).toHaveBeenCalledWith('msg-uuid-1', {
        status: ContactMessageStatus.READ,
        adminNote: undefined,
      });
    });

    it('sets the admin note and archives', async () => {
      contactRepositoryMock.findById.mockResolvedValue(makeMessage());
      contactRepositoryMock.update.mockResolvedValue(
        makeMessage({ status: ContactMessageStatus.ARCHIVED, adminNote: 'done' }),
      );

      const result = await service.update('msg-uuid-1', {
        status: ContactMessageStatus.ARCHIVED,
        adminNote: 'done',
      });

      expect(result.adminNote).toBe('done');
      expect(result.status).toBe(ContactMessageStatus.ARCHIVED);
    });

    it('transitions status to IN_PROGRESS and attaches matchedUserId (TASK-256)', async () => {
      contactRepositoryMock.findById.mockResolvedValue(makeMessage());
      contactRepositoryMock.update.mockResolvedValue(
        makeMessage({ status: ContactMessageStatus.IN_PROGRESS }),
      );
      contactRepositoryMock.findMatchingUserId.mockResolvedValue('user-uuid-1');

      const result = await service.update('msg-uuid-1', {
        status: ContactMessageStatus.IN_PROGRESS,
      });

      expect(result.status).toBe(ContactMessageStatus.IN_PROGRESS);
      expect(result.matchedUserId).toBe('user-uuid-1');
      expect(contactRepositoryMock.findMatchingUserId).toHaveBeenCalledWith('ivan@example.com');
    });

    it('throws NotFoundException when the message is missing', async () => {
      contactRepositoryMock.findById.mockResolvedValue(null);

      await expect(
        service.update('missing', { status: ContactMessageStatus.READ }),
      ).rejects.toThrow(NotFoundException);
      expect(contactRepositoryMock.update).not.toHaveBeenCalled();
    });
  });

  describe('unreadCount', () => {
    it('returns the NEW-status count', async () => {
      contactRepositoryMock.countByStatus.mockResolvedValue(7);

      const result = await service.unreadCount();

      expect(result).toBe(7);
      expect(contactRepositoryMock.countByStatus).toHaveBeenCalledWith(ContactMessageStatus.NEW);
    });
  });
});
