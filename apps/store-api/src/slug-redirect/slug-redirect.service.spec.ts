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

      expect(mockRepository.findRedirect).toHaveBeenCalledWith(SlugRedirectEntity.PAGE, 'old', '');
      expect(result).toEqual({ newSlug: 'new' });
    });

    it('looks up a namespaced address and reports where the live page is served (TASK-566)', async () => {
      mockRepository.findRedirect.mockResolvedValue({
        id: 'id-2',
        entity: SlugRedirectEntity.PAGE,
        scope: 'LEGAL',
        oldSlug: 'delivery',
        newScope: 'INFO',
        newSlug: 'dostavka',
      });

      const result = await service.lookup(SlugRedirectEntity.PAGE, 'delivery', 'LEGAL');

      expect(mockRepository.findRedirect).toHaveBeenCalledWith(
        SlugRedirectEntity.PAGE,
        'delivery',
        'LEGAL',
      );
      expect(result).toEqual({ newSlug: 'dostavka', newScope: 'INFO' });
    });

    it('omits newScope for a single-namespace entity', async () => {
      mockRepository.findRedirect.mockResolvedValue({
        id: 'id-3',
        entity: SlugRedirectEntity.PRODUCT,
        scope: '',
        oldSlug: 'a',
        newScope: '',
        newSlug: 'b',
      });

      const result = await service.lookup(SlugRedirectEntity.PRODUCT, 'a');

      expect(result).toEqual({ newSlug: 'b' });
      expect(result).not.toHaveProperty('newScope');
    });

    it('returns null when no redirect row exists', async () => {
      mockRepository.findRedirect.mockResolvedValue(null);

      await expect(service.lookup(SlugRedirectEntity.PRODUCT, 'missing')).resolves.toBeNull();
    });
  });
});
