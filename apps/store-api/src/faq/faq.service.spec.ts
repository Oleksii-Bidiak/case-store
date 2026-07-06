import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FaqRepository } from './faq.repository';
import { FaqService } from './faq.service';
import { FaqItemEntity } from './entities';
import { RevalidationNotifier } from '../publishing';

const mockFaq = {
  id: 'faq-uuid-1',
  question: 'Скільки коштує доставка?',
  answer: 'Безкоштовно від 1 000 ₴.',
  sortOrder: 0,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const repositoryMock = {
  findAllActive: jest.fn(),
  findAllAdmin: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const revalidationMock = {
  revalidate: jest.fn(),
};

describe('FaqService', () => {
  let service: FaqService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaqService,
        { provide: FaqRepository, useValue: repositoryMock },
        { provide: RevalidationNotifier, useValue: revalidationMock },
      ],
    }).compile();

    service = module.get<FaqService>(FaqService);
    jest.clearAllMocks();
    revalidationMock.revalidate.mockResolvedValue(undefined);
  });

  describe('findAllActive', () => {
    it('maps active items into entities', async () => {
      repositoryMock.findAllActive.mockResolvedValue([mockFaq]);

      const result = await service.findAllActive();

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toBeInstanceOf(FaqItemEntity);
      expect(result.data[0].question).toBe('Скільки коштує доставка?');
    });
  });

  describe('findAllAdmin', () => {
    it('maps all items into entities', async () => {
      repositoryMock.findAllAdmin.mockResolvedValue([mockFaq]);

      const result = await service.findAllAdmin();

      expect(result.data[0]).toBeInstanceOf(FaqItemEntity);
    });
  });

  describe('findById', () => {
    it('returns the entity when found', async () => {
      repositoryMock.findById.mockResolvedValue(mockFaq);

      const result = await service.findById('faq-uuid-1');

      expect(result).toBeInstanceOf(FaqItemEntity);
      expect(result.id).toBe('faq-uuid-1');
    });

    it('throws NotFoundException when missing', async () => {
      repositoryMock.findById.mockResolvedValue(null);

      await expect(service.findById('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates, maps the entity, and revalidates the faq tag', async () => {
      repositoryMock.create.mockResolvedValue(mockFaq);

      const result = await service.create({ question: 'Q', answer: 'A' });

      expect(repositoryMock.create).toHaveBeenCalledWith({
        question: 'Q',
        answer: 'A',
        sortOrder: undefined,
        isActive: undefined,
      });
      expect(revalidationMock.revalidate).toHaveBeenCalledWith({ tags: ['faq'] });
      expect(result).toBeInstanceOf(FaqItemEntity);
    });
  });

  describe('update', () => {
    it('updates an existing item and revalidates the faq tag', async () => {
      repositoryMock.findById.mockResolvedValue(mockFaq);
      repositoryMock.update.mockResolvedValue({ ...mockFaq, isActive: false });

      const result = await service.update('faq-uuid-1', { isActive: false });

      expect(repositoryMock.update).toHaveBeenCalledWith('faq-uuid-1', {
        question: undefined,
        answer: undefined,
        sortOrder: undefined,
        isActive: false,
      });
      expect(revalidationMock.revalidate).toHaveBeenCalledWith({ tags: ['faq'] });
      expect(result.isActive).toBe(false);
    });

    it('throws NotFoundException when the item is missing (no revalidate)', async () => {
      repositoryMock.findById.mockResolvedValue(null);

      await expect(service.update('ghost', { question: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repositoryMock.update).not.toHaveBeenCalled();
      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an existing item, revalidates, and returns the id', async () => {
      repositoryMock.findById.mockResolvedValue(mockFaq);
      repositoryMock.delete.mockResolvedValue(mockFaq);

      const result = await service.remove('faq-uuid-1');

      expect(repositoryMock.delete).toHaveBeenCalledWith('faq-uuid-1');
      expect(revalidationMock.revalidate).toHaveBeenCalledWith({ tags: ['faq'] });
      expect(result).toEqual({ id: 'faq-uuid-1' });
    });

    it('throws NotFoundException when the item is missing (no delete)', async () => {
      repositoryMock.findById.mockResolvedValue(null);

      await expect(service.remove('ghost')).rejects.toBeInstanceOf(NotFoundException);
      expect(repositoryMock.delete).not.toHaveBeenCalled();
      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });
  });
});
