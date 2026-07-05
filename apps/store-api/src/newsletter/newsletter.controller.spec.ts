import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { NewsletterService } from './newsletter.service';
import { NewsletterController } from './newsletter.controller';
import { AdminNewsletterController } from './admin-newsletter.controller';

const serviceMock = {
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  findAll: jest.fn(),
  exportCsv: jest.fn(),
};

describe('NewsletterController (public)', () => {
  let controller: NewsletterController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NewsletterController],
      providers: [{ provide: NewsletterService, useValue: serviceMock }],
    }).compile();

    controller = module.get<NewsletterController>(NewsletterController);
  });

  it('wraps the subscribe result in a { data } envelope', async () => {
    serviceMock.subscribe.mockResolvedValue({ subscribed: true });

    const result = await controller.subscribe({ email: 'user@example.com' });

    expect(result).toEqual({ data: { subscribed: true } });
    expect(serviceMock.subscribe).toHaveBeenCalledWith({ email: 'user@example.com' });
  });

  it('wraps the unsubscribe result in a { data } envelope', async () => {
    serviceMock.unsubscribe.mockResolvedValue({ unsubscribed: true });

    const result = await controller.unsubscribe({ email: 'user@example.com' });

    expect(result).toEqual({ data: { unsubscribed: true } });
  });

  it('rate-limits the subscribe endpoint via @Throttle (5/min)', () => {
    // @Throttle stores the limit as method metadata keyed `<THROTTLER_LIMIT>default`.
    const limit = Reflect.getMetadata(
      `${THROTTLER_LIMIT}default`,
      NewsletterController.prototype.subscribe,
    );
    expect(limit).toBe(5);
  });
});

describe('AdminNewsletterController', () => {
  let controller: AdminNewsletterController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminNewsletterController],
      providers: [{ provide: NewsletterService, useValue: serviceMock }],
    }).compile();

    controller = module.get<AdminNewsletterController>(AdminNewsletterController);
  });

  it('returns the paginated list envelope from the service', async () => {
    const payload = { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
    serviceMock.findAll.mockResolvedValue(payload);

    const result = await controller.findAll({});

    expect(result).toBe(payload);
  });

  it('sends CSV with attachment + text/csv headers', async () => {
    serviceMock.exportCsv.mockResolvedValue('email,status,source,createdAt');

    const setHeader = jest.fn();
    const send = jest.fn();
    const response = { setHeader, send } as unknown as Response;

    await controller.export({}, response);

    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="newsletter-subscribers.csv"',
    );
    expect(send).toHaveBeenCalledWith('email,status,source,createdAt');
  });
});
