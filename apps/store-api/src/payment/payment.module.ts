import { Module } from '@nestjs/common';
import { OrderModule } from '../order';
import { LiqPayAdapter } from './adapters/liqpay/liqpay.adapter';
import { LiqPayWebhookController } from './liqpay-webhook.controller';
import { PAYMENT_CLOCK, systemClock } from './payment.clock';
import { PaymentController } from './payment.controller';
import { AdminPaymentController } from './admin-payment.controller';
import { PAYMENT_PROVIDER } from './payment.port';
import { PaymentReconcileWorker } from './payment-reconcile.worker';
import { PaymentRepository } from './payment.repository';
import { PaymentService } from './payment.service';

/**
 * PaymentModule — online payments (TASK-330, plan 163).
 *
 * The provider is bound ONCE here, by token. Every consumer injects
 * {@link PAYMENT_PROVIDER} and sees only the {@link PaymentProvider} interface,
 * so adding monobank/WayForPay later is a new folder under `adapters/` plus one
 * line in this file — not a rewrite (docs/payments-liqpay.md §12).
 *
 * `useExisting` rather than `useClass` so the adapter is a single instance
 * shared by the token and by anything that injects the concrete class (its
 * `isSandbox()` is adapter-specific and not part of the port).
 *
 * Imports {@link OrderModule} for `OrderService` — the one door through which
 * this module is allowed to move an order.
 */
@Module({
  imports: [OrderModule],
  controllers: [PaymentController, AdminPaymentController, LiqPayWebhookController],
  providers: [
    PaymentRepository,
    PaymentService,
    LiqPayAdapter,
    { provide: PAYMENT_PROVIDER, useExisting: LiqPayAdapter },
    { provide: PAYMENT_CLOCK, useValue: systemClock },
    PaymentReconcileWorker,
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
