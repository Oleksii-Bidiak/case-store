// Mail Module — public API
export { MailModule } from './mail.module';
export { MailService } from './mail.service';
export type { SendOrderConfirmationParams } from './mail.service';
export {
  buildOrderConfirmationEmail,
  type OrderConfirmationParams,
  type OrderConfirmationMailPayload,
  type MailTemplate,
} from './templates/order-confirmation.template';
