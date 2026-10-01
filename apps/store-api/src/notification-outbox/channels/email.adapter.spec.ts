import { NotificationChannel, NotificationOutbox, NotificationOutboxStatus } from '@prisma/client';
import { EmailAdapter } from './email.adapter';
import { MailService } from '../../mail/mail.service';
import {
  ACCOUNT_LOCKED_MAIL_TYPE,
  EMAIL_CHANGE_CONFIRM_MAIL_TYPE,
  EMAIL_CHANGE_NOTICE_MAIL_TYPE,
  EMAIL_VERIFICATION_MAIL_TYPE,
  ORDER_CONFIRMATION_MAIL_TYPE,
  ORDER_PAYMENT_EXPIRED_MAIL_TYPE,
  ORDER_SHIPPED_MAIL_TYPE,
  PASSWORD_RESET_MAIL_TYPE,
} from '../notification-outbox.types';

const SENDERS = [
  'sendOrderConfirmationPayload',
  'sendPasswordResetPayload',
  'sendOrderShippedPayload',
  'sendOrderPaymentExpiredPayload',
  'sendAccountLockedPayload',
  'sendEmailVerificationPayload',
  'sendEmailChangeConfirmPayload',
  'sendEmailChangeNoticePayload',
] as const;

type Sender = (typeof SENDERS)[number];

const mailServiceMock = {
  isEnabled: jest.fn(),
  ...(Object.fromEntries(SENDERS.map((name) => [name, jest.fn()])) as Record<Sender, jest.Mock>),
};

const makeRow = (type: string, payload: unknown): NotificationOutbox => ({
  id: 'row-1',
  type,
  channel: NotificationChannel.EMAIL,
  recipientAddress: 'buyer@example.com',
  payload: payload as NotificationOutbox['payload'],
  status: NotificationOutboxStatus.PENDING,
  attempts: 0,
  maxAttempts: 5,
  lastError: null,
  nextAttemptAt: new Date('2026-10-01T12:00:00.000Z'),
  createdAt: new Date('2026-10-01T12:00:00.000Z'),
  sentAt: null,
});

describe('EmailAdapter', () => {
  let adapter: EmailAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const name of SENDERS) mailServiceMock[name].mockResolvedValue(undefined);
    adapter = new EmailAdapter(mailServiceMock as unknown as MailService);
  });

  it('serves the EMAIL channel', () => {
    expect(adapter.channel).toBe(NotificationChannel.EMAIL);
  });

  it.each<[string, Sender]>([
    [ORDER_CONFIRMATION_MAIL_TYPE, 'sendOrderConfirmationPayload'],
    [PASSWORD_RESET_MAIL_TYPE, 'sendPasswordResetPayload'],
    [ORDER_SHIPPED_MAIL_TYPE, 'sendOrderShippedPayload'],
    [ORDER_PAYMENT_EXPIRED_MAIL_TYPE, 'sendOrderPaymentExpiredPayload'],
    [ACCOUNT_LOCKED_MAIL_TYPE, 'sendAccountLockedPayload'],
    [EMAIL_VERIFICATION_MAIL_TYPE, 'sendEmailVerificationPayload'],
    [EMAIL_CHANGE_CONFIRM_MAIL_TYPE, 'sendEmailChangeConfirmPayload'],
    [EMAIL_CHANGE_NOTICE_MAIL_TYPE, 'sendEmailChangeNoticePayload'],
  ])('routes a %s row to %s with the stored payload, and nothing else', async (type, sender) => {
    const payload = { to: 'buyer@example.com', marker: type };

    await adapter.send(makeRow(type, payload));

    expect(mailServiceMock[sender]).toHaveBeenCalledTimes(1);
    expect(mailServiceMock[sender]).toHaveBeenCalledWith(payload);
    for (const other of SENDERS.filter((name) => name !== sender)) {
      expect(mailServiceMock[other]).not.toHaveBeenCalled();
    }
  });

  it('propagates a transport failure so the dispatcher can retry the row', async () => {
    mailServiceMock.sendPasswordResetPayload.mockRejectedValue(new Error('SMTP timeout'));

    await expect(adapter.send(makeRow(PASSWORD_RESET_MAIL_TYPE, {}))).rejects.toThrow(
      'SMTP timeout',
    );
  });

  it('throws a plain (transient) Error for an unknown type, sending nothing', async () => {
    const sent = adapter.send(makeRow('unknown-type', {}));

    await expect(sent).rejects.toThrow('Unknown mail outbox type: unknown-type');
    await expect(sent).rejects.not.toHaveProperty('name', 'PermanentDeliveryError');
    for (const name of SENDERS) expect(mailServiceMock[name]).not.toHaveBeenCalled();
  });

  it.each([true, false])('isEnabled() delegates to MailService.isEnabled() (%s)', (enabled) => {
    mailServiceMock.isEnabled.mockReturnValue(enabled);

    expect(adapter.isEnabled()).toBe(enabled);
    expect(mailServiceMock.isEnabled).toHaveBeenCalledTimes(1);
  });

  it('healthcheck reports ok / disabled from configuration alone, sending nothing', async () => {
    mailServiceMock.isEnabled.mockReturnValue(true);
    await expect(adapter.healthcheck()).resolves.toEqual({ state: 'ok' });

    mailServiceMock.isEnabled.mockReturnValue(false);
    await expect(adapter.healthcheck()).resolves.toMatchObject({ state: 'disabled' });

    for (const name of SENDERS) expect(mailServiceMock[name]).not.toHaveBeenCalled();
  });
});
