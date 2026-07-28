// Payment Module — public API (TASK-330).
//
// Nothing here names a provider: `adapters/` is intentionally NOT re-exported,
// so no consumer can accidentally couple itself to LiqPay's vocabulary.
export { PaymentModule } from './payment.module';
export { PaymentService } from './payment.service';
export { PaymentRepository } from './payment.repository';
export { PaymentEntity, PaymentCheckoutEntity } from './entities';
export { PAYMENT_PROVIDER } from './payment.port';
export type { PaymentProvider, CreateCheckoutParams, HostedCheckoutHandoff } from './payment.port';
export { PaymentOutcome } from './payment.types';
export type { PaymentEventInput, PaymentApplyResult } from './payment.types';
