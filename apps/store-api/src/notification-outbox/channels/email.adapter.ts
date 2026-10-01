import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationOutbox } from '@prisma/client';
import { MailService } from '../../mail/mail.service';
import type { OrderConfirmationMailPayload } from '../../mail/templates/order-confirmation.template';
import type { PasswordResetMailPayload } from '../../mail/templates/password-reset.template';
import type { AccountLockedMailPayload } from '../../mail/templates/account-locked.template';
import type { EmailVerificationMailPayload } from '../../mail/templates/email-verification.template';
import type { OrderShippedMailPayload } from '../../mail/templates/order-shipped.template';
import type { OrderPaymentExpiredMailPayload } from '../../mail/templates/order-payment-expired.template';
import type {
  EmailChangeConfirmMailPayload,
  EmailChangeNoticeMailPayload,
} from '../../mail/templates/email-change.template';
import {
  ACCOUNT_LOCKED_MAIL_TYPE,
  EMAIL_CHANGE_CONFIRM_MAIL_TYPE,
  EMAIL_CHANGE_NOTICE_MAIL_TYPE,
  EMAIL_VERIFICATION_MAIL_TYPE,
  ORDER_CONFIRMATION_MAIL_TYPE,
  ORDER_SHIPPED_MAIL_TYPE,
  ORDER_PAYMENT_EXPIRED_MAIL_TYPE,
  PASSWORD_RESET_MAIL_TYPE,
} from '../notification-outbox.types';
import type { ChannelHealth, NotificationChannelAdapter } from './notification-channel-adapter';

/**
 * EmailAdapter — the EMAIL channel of the notification outbox (TASK-673).
 *
 * A thin wrapper over {@link MailService}: rendering stays in the mail templates
 * and SMTP stays in the mail service. This class only maps an outbox `type` to
 * the matching `send*Payload` call — the exact `switch` the outbox service ran
 * before channels existed, moved here unchanged.
 */
@Injectable()
export class EmailAdapter implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.EMAIL;

  constructor(private readonly mailService: MailService) {}

  isEnabled(): boolean {
    return this.mailService.isEnabled();
  }

  /**
   * Cheap on purpose: reports whether mail is configured, without opening an
   * SMTP connection — a probe that talks to the relay on every admin page view
   * would itself become a source of load and of flaky "failed" states.
   */
  healthcheck(): Promise<ChannelHealth> {
    return Promise.resolve(
      this.mailService.isEnabled()
        ? { state: 'ok' }
        : { state: 'disabled', detail: 'MAIL_ENABLED is false' },
    );
  }

  /**
   * Render and send a row by its `type`. An unknown type throws a plain `Error`
   * — the dispatcher treats it as a transient failure, so the row is rescheduled
   * (visible via `lastError`) rather than silently lost.
   */
  async send(row: NotificationOutbox): Promise<void> {
    switch (row.type) {
      case ORDER_CONFIRMATION_MAIL_TYPE:
        await this.mailService.sendOrderConfirmationPayload(
          row.payload as unknown as OrderConfirmationMailPayload,
        );
        return;
      case PASSWORD_RESET_MAIL_TYPE:
        await this.mailService.sendPasswordResetPayload(
          row.payload as unknown as PasswordResetMailPayload,
        );
        return;
      case ORDER_SHIPPED_MAIL_TYPE:
        await this.mailService.sendOrderShippedPayload(
          row.payload as unknown as OrderShippedMailPayload,
        );
        return;
      case ORDER_PAYMENT_EXPIRED_MAIL_TYPE:
        await this.mailService.sendOrderPaymentExpiredPayload(
          row.payload as unknown as OrderPaymentExpiredMailPayload,
        );
        return;
      case ACCOUNT_LOCKED_MAIL_TYPE:
        await this.mailService.sendAccountLockedPayload(
          row.payload as unknown as AccountLockedMailPayload,
        );
        return;
      case EMAIL_VERIFICATION_MAIL_TYPE:
        await this.mailService.sendEmailVerificationPayload(
          row.payload as unknown as EmailVerificationMailPayload,
        );
        return;
      case EMAIL_CHANGE_CONFIRM_MAIL_TYPE:
        await this.mailService.sendEmailChangeConfirmPayload(
          row.payload as unknown as EmailChangeConfirmMailPayload,
        );
        return;
      case EMAIL_CHANGE_NOTICE_MAIL_TYPE:
        await this.mailService.sendEmailChangeNoticePayload(
          row.payload as unknown as EmailChangeNoticeMailPayload,
        );
        return;
      default:
        throw new Error(`Unknown mail outbox type: ${row.type}`);
    }
  }
}
