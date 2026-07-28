import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { LiqPayCallbackDto } from './dto';
import { LiqPayWebhookController } from './liqpay-webhook.controller';
import { PaymentService } from './payment.service';

const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  setContext: jest.fn(),
};

const paymentServiceMock = { handleCallback: jest.fn() };

function buildController(): LiqPayWebhookController {
  return new LiqPayWebhookController(
    paymentServiceMock as unknown as PaymentService,
    loggerMock as unknown as PinoLogger,
  );
}

/** The pipe as it is configured globally in `main.ts`. */
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const asBody = { type: 'body' as const, metatype: LiqPayCallbackDto };

describe('LiqPayWebhookController', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('the DTO must declare EXACTLY data + signature', () => {
    it('accepts the two fields LiqPay actually posts', async () => {
      await expect(
        globalPipe.transform({ data: 'ZGF0YQ==', signature: 'sig' }, asBody),
      ).resolves.toMatchObject({ data: 'ZGF0YQ==', signature: 'sig' });
    });

    it('rejects an extra top-level field — the trap that 400s every callback', async () => {
      // `forbidNonWhitelisted` is global. If this DTO ever grows out of sync
      // with what LiqPay posts, every callback 400s, LiqPay retries forever and
      // no order is ever marked paid. This test is the tripwire.
      await expect(
        globalPipe.transform({ data: 'ZGF0YQ==', signature: 'sig', extra: '1' }, asBody),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a missing or empty field', async () => {
      await expect(globalPipe.transform({ data: 'ZGF0YQ==' }, asBody)).rejects.toThrow(
        BadRequestException,
      );
      await expect(globalPipe.transform({ signature: 'sig' }, asBody)).rejects.toThrow(
        BadRequestException,
      );
      await expect(globalPipe.transform({ data: '', signature: 'sig' }, asBody)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('declares no properties beyond the two', () => {
      expect(Object.keys(new LiqPayCallbackDto() as unknown as Record<string, unknown>)).toEqual(
        [],
      );
      // Guard the shape via the validator metadata rather than instance keys,
      // which are undefined until assigned.
      const validated = Object.getOwnPropertyNames(LiqPayCallbackDto.prototype);
      expect(validated).toEqual(['constructor']);
    });
  });

  describe('route exposure', () => {
    it('applies no guards — the signature is the authentication', () => {
      // Verified facts (plan 163 §4): the only global guard is ThrottlerGuard,
      // and CSRF is mounted on /api/auth/refresh, /api/cart and /api/wishlist
      // only, so a webhook route is not blocked by it.
      expect(Reflect.getMetadata('__guards__', LiqPayWebhookController)).toBeUndefined();
      expect(
        Reflect.getMetadata('__guards__', LiqPayWebhookController.prototype.handleLiqPayCallback),
      ).toBeUndefined();
    });

    it('skips the global rate limiter', () => {
      // A 429 is a payment LiqPay has to keep retrying; a burst of callbacks is
      // normal operation, not abuse.
      const keys = Reflect.getMetadataKeys(
        LiqPayWebhookController.prototype.handleLiqPayCallback,
      ) as string[];

      expect(keys.some((key) => key.startsWith('THROTTLER:SKIP'))).toBe(true);
    });

    it('answers 200, not 201 — a provider that does not get 200 retries forever', () => {
      expect(
        Reflect.getMetadata('__httpCode__', LiqPayWebhookController.prototype.handleLiqPayCallback),
      ).toBe(200);
    });
  });

  describe('handleLiqPayCallback', () => {
    it('400s an unverifiable signature', async () => {
      paymentServiceMock.handleCallback.mockResolvedValue(null);

      await expect(
        buildController().handleLiqPayCallback({ data: 'x', signature: 'forged' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('200s an applied event', async () => {
      paymentServiceMock.handleCallback.mockResolvedValue({ applied: true, orderId: 'order-1' });

      await expect(
        buildController().handleLiqPayCallback({ data: 'x', signature: 'y' }),
      ).resolves.toEqual({ data: { received: true } });
    });

    it('200s a duplicate so the provider stops retrying', async () => {
      paymentServiceMock.handleCallback.mockResolvedValue({ applied: false, orderId: 'order-1' });

      await expect(
        buildController().handleLiqPayCallback({ data: 'x', signature: 'y' }),
      ).resolves.toEqual({ data: { received: true } });
    });

    it('200s a non-actionable event for an unknown payment', async () => {
      paymentServiceMock.handleCallback.mockResolvedValue({ applied: false, orderId: '' });

      await expect(
        buildController().handleLiqPayCallback({ data: 'x', signature: 'y' }),
      ).resolves.toEqual({ data: { received: true } });
    });

    it('passes the body straight through and logs neither data nor signature', async () => {
      paymentServiceMock.handleCallback.mockResolvedValue({ applied: true, orderId: 'order-1' });
      const body = { data: 'secret-payload', signature: 'secret-signature' };

      await buildController().handleLiqPayCallback(body);

      expect(paymentServiceMock.handleCallback).toHaveBeenCalledWith(body);
      const logged = JSON.stringify(loggerMock.info.mock.calls);
      expect(logged).not.toContain('secret-payload');
      expect(logged).not.toContain('secret-signature');
    });
  });
});
