import type { Prisma } from '@prisma/client';
import type { LockedOrder } from './order-money.repository';

/**
 * The seam through which the order module asks the PAYMENT module to send money
 * back through LiqPay (R2 A3, TASK-2047 / TASK-1500).
 *
 * ── Why a port ──────────────────────────────────────────────────────────────
 * `PaymentModule` imports `OrderModule` (it moves orders only through
 * `OrderService`), so the order module cannot import the payment one back. The
 * operator's payout door lives here, in the order module, and a LIQPAY_REFUND
 * payout is the one kind that has to reach the provider. Same shape as
 * `GUEST_ORDER_CLAIM_PORT`: `PaymentModule` binds this token to
 * `PaymentService` with `useExisting`, and `OrderMoneyService` resolves it
 * through `ModuleRef` with `{ strict: false }` at call time.
 */
export const PROVIDER_REFUND_PORT = Symbol('PROVIDER_REFUND_PORT');

export interface LedgerRefundRequest {
  orderId: string;
  /** The LiqPay attempt the money goes back to; must belong to `orderId`. */
  paymentId: string;
  /** Integer kopecks. */
  amountKop: number;
  actorId: string | null;
  /** The return this payout settles, if any. */
  returnId: string | null;
  reason: string | null;
  /**
   * The operator's payout rules, run inside the transaction that writes the
   * REQUESTED entry, right after the order-row lock — so they read the same
   * numbers the write commits against. Throwing rolls everything back and
   * nothing reaches the provider.
   */
  guard: (tx: Prisma.TransactionClient, order: LockedOrder) => Promise<void>;
}

export interface ProviderRefundPort {
  /**
   * Write a REQUESTED `LIQPAY_REFUND` entry (guarded, under the order lock), ask
   * the provider, void the entry if it refuses. Resolves once the provider
   * accepted the request — confirmation still comes from its callback.
   */
  requestLedgerRefund(request: LedgerRefundRequest): Promise<void>;
}
