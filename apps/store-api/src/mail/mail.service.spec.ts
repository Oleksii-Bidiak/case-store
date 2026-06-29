import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { PinoLogger } from 'nestjs-pino';
import { MailService } from './mail.service';
import type { OrderEntity } from '../order/entities';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const createTransportMock = createTransport as jest.MockedFunction<typeof createTransport>;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const order = {
  id: 'order-uuid-1234-abcd',
  createdAt: new Date('2026-06-11T12:00:00.000Z'),
  items: [
    {
      productName: 'iPhone 15 Pro Case',
      variantName: 'Black',
      quantity: 2,
      price: '29.99',
      lineTotal: '59.98',
    },
  ],
  subtotal: '59.98',
  discount: '0.00',
  shippingCost: '0.00',
  tax: '0.00',
  total: '59.98',
  shippingAddress: null,
} as unknown as OrderEntity;

/** ConfigService stub backed by a plain key→value map. */
function makeConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

/** No-op PinoLogger stub. */
function makeLogger(): PinoLogger {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    setContext: jest.fn(),
  } as unknown as PinoLogger;
}

const enabledConfig = (): Record<string, unknown> => ({
  MAIL_ENABLED: 'true',
  MAIL_FROM: 'MobileStore <no-reply@example.com>',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: 587,
  SMTP_SECURE: 'false',
  SMTP_USER: 'user',
  SMTP_PASS: 'pass',
});

describe('MailService', () => {
  let sendMail: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail = jest.fn().mockResolvedValue({ messageId: 'abc' });
    createTransportMock.mockReturnValue({ sendMail } as never);
  });

  describe('when MAIL_ENABLED is "true"', () => {
    it('creates a transport and sends a message with the correct to/subject/html', async () => {
      const service = new MailService(makeConfig(enabledConfig()), makeLogger());

      await service.sendOrderConfirmation({
        to: 'customer@example.com',
        order,
        customerName: 'Olena',
      });

      expect(createTransportMock).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledTimes(1);

      const message = sendMail.mock.calls[0][0];
      expect(message.to).toBe('customer@example.com');
      expect(message.from).toBe('MobileStore <no-reply@example.com>');
      expect(message.subject).toContain('ORDER-UU'); // first 8 chars, uppercased
      expect(typeof message.html).toBe('string');
      expect(message.html.length).toBeGreaterThan(0);
      expect(message.html).toContain('iPhone 15 Pro Case');
      expect(message.text).toContain('59.98');
    });

    it('passes SMTP auth credentials to the transport', async () => {
      const service = new MailService(makeConfig(enabledConfig()), makeLogger());

      await service.sendOrderConfirmation({ to: 'c@example.com', order });

      expect(createTransportMock).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          auth: { user: 'user', pass: 'pass' },
        }),
      );
    });

    it('does not throw when sending succeeds', async () => {
      const service = new MailService(makeConfig(enabledConfig()), makeLogger());

      await expect(
        service.sendOrderConfirmation({ to: 'c@example.com', order }),
      ).resolves.toBeUndefined();
    });
  });

  describe('when MAIL_ENABLED is not "true"', () => {
    it('does not create a transport or send anything', async () => {
      const service = new MailService(makeConfig({ MAIL_ENABLED: 'false' }), makeLogger());

      await service.sendOrderConfirmation({ to: 'c@example.com', order });

      expect(createTransportMock).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('resolves without throwing (no-op)', async () => {
      const service = new MailService(makeConfig({}), makeLogger());

      await expect(
        service.sendOrderConfirmation({ to: 'c@example.com', order }),
      ).resolves.toBeUndefined();
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('logs the skip at info level (visible at default LOG_LEVEL), not debug', async () => {
      const logger = makeLogger();
      const service = new MailService(makeConfig({ MAIL_ENABLED: 'false' }), logger);

      await service.sendOrderConfirmation({ to: 'c@example.com', order });

      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        'Mail disabled — skipping order confirmation to c@example.com',
      );
      expect(logger.debug).not.toHaveBeenCalled();
    });
  });
});
