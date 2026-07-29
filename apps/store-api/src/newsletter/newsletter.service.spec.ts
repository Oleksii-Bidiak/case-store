import { Test, TestingModule } from '@nestjs/testing';
import { NewsletterStatus } from '@prisma/client';
import { NewsletterRepository } from './newsletter.repository';
import { NewsletterService } from './newsletter.service';

const mockRow = {
  id: 'sub-uuid-1',
  email: 'user@example.com',
  status: NewsletterStatus.SUBSCRIBED,
  source: 'home',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  unsubscribedAt: null,
};

const repositoryMock = {
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  findAll: jest.fn(),
  findAllForExport: jest.fn(),
  findByEmail: jest.fn(),
};

describe('NewsletterService', () => {
  let service: NewsletterService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [NewsletterService, { provide: NewsletterRepository, useValue: repositoryMock }],
    }).compile();

    service = module.get<NewsletterService>(NewsletterService);
  });

  describe('subscribe', () => {
    it('normalizes the email (trim + lowercase) before delegating', async () => {
      repositoryMock.subscribe.mockResolvedValue(mockRow);

      const result = await service.subscribe({ email: '  User@Example.COM ', source: 'home' });

      expect(result).toEqual({ subscribed: true });
      expect(repositoryMock.subscribe).toHaveBeenCalledWith('user@example.com', 'home');
    });

    it('is idempotent — always resolves { subscribed: true } regardless of prior state', async () => {
      repositoryMock.subscribe.mockResolvedValue({
        ...mockRow,
        status: NewsletterStatus.SUBSCRIBED,
      });

      const first = await service.subscribe({ email: 'a@b.com' });
      const second = await service.subscribe({ email: 'a@b.com' });

      expect(first).toEqual({ subscribed: true });
      expect(second).toEqual({ subscribed: true });
    });
  });

  describe('unsubscribe', () => {
    it('normalizes email and resolves { unsubscribed: true } even for unknown addresses', async () => {
      repositoryMock.unsubscribe.mockResolvedValue(null);

      const result = await service.unsubscribe('  Ghost@Example.com ');

      expect(result).toEqual({ unsubscribed: true });
      expect(repositoryMock.unsubscribe).toHaveBeenCalledWith('ghost@example.com');
    });
  });

  describe('findAll', () => {
    it('maps rows to entities and builds pagination meta', async () => {
      repositoryMock.findAll.mockResolvedValue({ subscriptions: [mockRow], total: 1 });

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].email).toBe('user@example.com');
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('forwards the requested sort to the repository (TASK-356)', async () => {
      // The DTO validating sortBy proves nothing on its own — a service that
      // drops it renders a sorted header over rows that never moved.
      repositoryMock.findAll.mockResolvedValue({ subscriptions: [], total: 0 });

      await service.findAll({ page: 1, limit: 20, sortBy: 'email', sortOrder: 'asc' });

      expect(repositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: 'email', sortOrder: 'asc' }),
      );
    });
  });

  describe('exportCsv', () => {
    it('maps rows to a header + CSV lines (email,status,source,createdAt)', async () => {
      repositoryMock.findAllForExport.mockResolvedValue([mockRow]);

      const csv = await service.exportCsv({});
      const lines = csv.split('\r\n');

      expect(lines[0]).toBe('email,status,source,createdAt');
      expect(lines[1]).toBe('user@example.com,SUBSCRIBED,home,2026-01-01T00:00:00.000Z');
    });

    it('renders an empty source as a blank field', async () => {
      repositoryMock.findAllForExport.mockResolvedValue([{ ...mockRow, source: null }]);

      const csv = await service.exportCsv({});

      expect(csv.split('\r\n')[1]).toBe('user@example.com,SUBSCRIBED,,2026-01-01T00:00:00.000Z');
    });

    it('quote-escapes fields containing commas or quotes', async () => {
      repositoryMock.findAllForExport.mockResolvedValue([{ ...mockRow, source: 'promo,"banner"' }]);

      const csv = await service.exportCsv({});

      expect(csv.split('\r\n')[1]).toContain('"promo,""banner"""');
    });
  });
});
