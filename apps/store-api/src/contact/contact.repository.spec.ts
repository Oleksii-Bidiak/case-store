import { Test, TestingModule } from '@nestjs/testing';
import { ContactMessage, ContactMessageStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { ContactRepository } from './contact.repository';

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

const prismaMock = {
  contactMessage: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

describe('ContactRepository', () => {
  let repository: ContactRepository;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ContactRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    repository = module.get<ContactRepository>(ContactRepository);
  });

  describe('create', () => {
    it('inserts a message with nullable topic/orderRef defaulted to null', async () => {
      const created = makeMessage({ topic: null, orderRef: null });
      prismaMock.contactMessage.create.mockResolvedValue(created);

      const result = await repository.create({
        name: 'Ivan Petrenko',
        phone: '+380671234567',
        email: 'ivan@example.com',
        message: 'Доброго дня!',
      });

      expect(result).toBe(created);
      expect(prismaMock.contactMessage.create).toHaveBeenCalledWith({
        data: {
          name: 'Ivan Petrenko',
          phone: '+380671234567',
          email: 'ivan@example.com',
          message: 'Доброго дня!',
          topic: null,
          orderRef: null,
        },
      });
    });
  });

  describe('findAll', () => {
    it('lists messages newest-first with pagination and no status filter', async () => {
      prismaMock.contactMessage.findMany.mockResolvedValue([makeMessage()]);
      prismaMock.contactMessage.count.mockResolvedValue(1);

      const result = await repository.findAll({ page: 1, limit: 20 });

      expect(result).toEqual({ messages: [makeMessage()], total: 1 });
      expect(prismaMock.contactMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('applies the status filter and computes skip from the page', async () => {
      prismaMock.contactMessage.findMany.mockResolvedValue([]);
      prismaMock.contactMessage.count.mockResolvedValue(0);

      await repository.findAll({ page: 3, limit: 10, status: ContactMessageStatus.ARCHIVED });

      expect(prismaMock.contactMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: ContactMessageStatus.ARCHIVED },
          skip: 20,
          take: 10,
        }),
      );
      expect(prismaMock.contactMessage.count).toHaveBeenCalledWith({
        where: { status: ContactMessageStatus.ARCHIVED },
      });
    });
  });

  describe('findById', () => {
    it('delegates to prisma.findUnique', async () => {
      const msg = makeMessage();
      prismaMock.contactMessage.findUnique.mockResolvedValue(msg);

      const result = await repository.findById('msg-uuid-1');

      expect(result).toBe(msg);
      expect(prismaMock.contactMessage.findUnique).toHaveBeenCalledWith({
        where: { id: 'msg-uuid-1' },
      });
    });
  });

  describe('update', () => {
    it('writes only the status when only status is provided', async () => {
      const updated = makeMessage({ status: ContactMessageStatus.READ });
      prismaMock.contactMessage.update.mockResolvedValue(updated);

      const result = await repository.update('msg-uuid-1', {
        status: ContactMessageStatus.READ,
      });

      expect(result).toBe(updated);
      expect(prismaMock.contactMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-uuid-1' },
        data: { status: ContactMessageStatus.READ },
      });
    });

    it('writes both status and adminNote when both are provided', async () => {
      prismaMock.contactMessage.update.mockResolvedValue(makeMessage());

      await repository.update('msg-uuid-1', {
        status: ContactMessageStatus.ARCHIVED,
        adminNote: 'Resolved by phone',
      });

      expect(prismaMock.contactMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-uuid-1' },
        data: { status: ContactMessageStatus.ARCHIVED, adminNote: 'Resolved by phone' },
      });
    });

    it('omits undefined fields from the update payload', async () => {
      prismaMock.contactMessage.update.mockResolvedValue(makeMessage());

      await repository.update('msg-uuid-1', {});

      expect(prismaMock.contactMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-uuid-1' },
        data: {},
      });
    });
  });

  describe('countByStatus', () => {
    it('counts messages in the given status', async () => {
      prismaMock.contactMessage.count.mockResolvedValue(4);

      const result = await repository.countByStatus(ContactMessageStatus.NEW);

      expect(result).toBe(4);
      expect(prismaMock.contactMessage.count).toHaveBeenCalledWith({
        where: { status: ContactMessageStatus.NEW },
      });
    });
  });
});
