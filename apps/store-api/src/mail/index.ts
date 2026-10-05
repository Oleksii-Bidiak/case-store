// Mail Module — public API
export { MailModule } from './mail.module';
export { MailService } from './mail.service';
export type { SendOrderConfirmationParams } from './mail.service';
export {
  buildOrderConfirmationEmail,
  formatMoney,
  orderNumber,
  type OrderConfirmationParams,
  type OrderConfirmationMailPayload,
  type MailTemplate,
} from './templates/order-confirmation.template';
// The payload each queued mail carries — the outbox stores it and hands it back
// to `MailService` on dispatch.
export type { AccountLockedMailPayload } from './templates/account-locked.template';
export type {
  EmailChangeConfirmMailPayload,
  EmailChangeNoticeMailPayload,
} from './templates/email-change.template';
export type { EmailVerificationMailPayload } from './templates/email-verification.template';
export type { OrderPaymentExpiredMailPayload } from './templates/order-payment-expired.template';
export type { OrderShippedMailPayload } from './templates/order-shipped.template';
export type { PasswordResetMailPayload } from './templates/password-reset.template';
