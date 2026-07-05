import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

const contactServiceMock = {
  create: jest.fn(),
};

describe('ContactController', () => {
  let controller: ContactController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactController],
      providers: [{ provide: ContactService, useValue: contactServiceMock }],
    }).compile();

    controller = module.get<ContactController>(ContactController);
  });

  describe('submit', () => {
    it('delegates to the service and returns only the new id', async () => {
      contactServiceMock.create.mockResolvedValue({ id: 'msg-uuid-1' });

      const dto = {
        name: 'Ivan Petrenko',
        phone: '+380671234567',
        email: 'ivan@example.com',
        message: 'Доброго дня! Питання по замовленню.',
      };

      const result = await controller.submit(dto as never);

      expect(result).toEqual({ data: { id: 'msg-uuid-1' } });
      expect(contactServiceMock.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('rate limiting', () => {
    // The @Throttle decorator writes per-handler metadata under these keys
    // (@nestjs/throttler). Asserting them proves the strict public-write limit
    // is wired without booting the guard.
    it('caps the public submit at 5 requests / 60s', () => {
      const handler = ContactController.prototype.submit;

      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(5);
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60000);
    });
  });
});
