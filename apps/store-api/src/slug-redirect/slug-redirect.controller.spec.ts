import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SlugRedirectEntity } from '@prisma/client';
import { SlugRedirectController } from './slug-redirect.controller';
import { SlugRedirectService } from './slug-redirect.service';

describe('SlugRedirectController', () => {
  let controller: SlugRedirectController;

  const mockService = {
    lookup: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlugRedirectController],
      providers: [{ provide: SlugRedirectService, useValue: mockService }],
    }).compile();

    controller = module.get(SlugRedirectController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('lookup', () => {
    it('returns the { data } envelope when a redirect exists', async () => {
      mockService.lookup.mockResolvedValue({ newSlug: 'new-slug' });

      const result = await controller.lookup({
        entity: SlugRedirectEntity.BLOG_POST,
        slug: 'old-slug',
      });

      expect(mockService.lookup).toHaveBeenCalledWith(SlugRedirectEntity.BLOG_POST, 'old-slug');
      expect(result).toEqual({ data: { newSlug: 'new-slug' } });
    });

    it('throws NotFoundException when no redirect exists', async () => {
      mockService.lookup.mockResolvedValue(null);

      await expect(
        controller.lookup({ entity: SlugRedirectEntity.PAGE, slug: 'missing' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
