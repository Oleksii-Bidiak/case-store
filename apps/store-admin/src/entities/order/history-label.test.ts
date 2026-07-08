import type { OrderStatusHistoryEntity } from "@/shared/api";
import {
  OrderStatusHistoryEntityChangeType,
  OrderEntityStatus,
  OrderEntityPaymentStatus,
} from "@/shared/api";
import { historyActorLabel, historyChangeLabel } from "./history-label";

const ORDER_USER_ID = "user-1";

function makeEntry(
  overrides: Partial<OrderStatusHistoryEntity>,
): OrderStatusHistoryEntity {
  return {
    id: "hist-1",
    orderId: "order-1",
    changeType: OrderStatusHistoryEntityChangeType.STATUS,
    fromStatus: null,
    toStatus: null,
    fromPaymentStatus: null,
    toPaymentStatus: null,
    changedBy: null,
    changedAt: "2026-07-08T10:00:00.000Z",
    ...overrides,
  };
}

describe("historyActorLabel (TASK-251)", () => {
  it("labels the order owner's own action as the customer", () => {
    expect(historyActorLabel(ORDER_USER_ID, ORDER_USER_ID)).toBe("Клієнт");
  });

  it("labels any other non-null actor as an admin", () => {
    expect(historyActorLabel("admin-9", ORDER_USER_ID)).toBe("Адміністратор");
  });

  it("labels a null actor as the system", () => {
    expect(historyActorLabel(null, ORDER_USER_ID)).toBe("Система");
  });
});

describe("historyChangeLabel (TASK-251)", () => {
  it("renders the creation row as the order's birth", () => {
    const label = historyChangeLabel(
      makeEntry({ fromStatus: null, toStatus: OrderEntityStatus.PENDING }),
    );
    expect(label).toBe("Замовлення створено (Очікує підтвердження)");
  });

  it("renders a status transition with both labels", () => {
    const label = historyChangeLabel(
      makeEntry({
        fromStatus: OrderEntityStatus.PENDING,
        toStatus: OrderEntityStatus.CONFIRMED,
      }),
    );
    expect(label).toBe("Статус: Очікує підтвердження → Підтверджено");
  });

  it("renders a payment-status change with both labels", () => {
    const label = historyChangeLabel(
      makeEntry({
        changeType: OrderStatusHistoryEntityChangeType.PAYMENT_STATUS,
        fromPaymentStatus: OrderEntityPaymentStatus.PENDING,
        toPaymentStatus: OrderEntityPaymentStatus.PAID,
      }),
    );
    expect(label).toBe("Оплата: Очікує оплати → Оплачено");
  });
});
