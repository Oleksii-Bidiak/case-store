import { Test, TestingModule } from '@nestjs/testing';
import { SlugRedirectEntity } from '@prisma/client';
import { SlugRedirectService } from './slug-redirect.service';
import { SlugRedirectRepository } from './slug-redirect.repository';

describe('SlugRedirectService', () => {
  let service: SlugRedirectService;

  const mockRepository = {
    findRedirect: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlugRedirectService,
        { provide: SlugRedirectRepository, useValue: mockRepository },
      ],
    }).compile();

    service = module.get(SlugRedirectService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('lookup', () => {
    it('returns the redirect target when a row exists', async () => {
      mockRepository.findRedirect.mockResolvedValue({
        id: 'id-1',
        entity: SlugRedirectEntity.PAGE,
        oldSlug: 'old',
        newSlug: 'new',
      });

      const result = await service.lookup(SlugRedirectEntity.PAGE, 'old');

      expect(mockRepository.findRedirect).toHaveBeenCalledWith(SlugRedirectEntity.PAGE, 'old');
      expect(result).toEqual({ newSlug: 'new' });
    });

    it('returns null when no redirect row exists', async () => {
      mockRepository.findRedirect.mockResolvedValue(null);

      await expect(service.lookup(SlugRedirectEntity.PRODUCT, 'missing')).resolves.toBeNull();
    });
  });
});
