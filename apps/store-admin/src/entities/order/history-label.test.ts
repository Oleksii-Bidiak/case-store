import type { OrderStatusHistoryEntity } from "@/shared/api";
import {
  OrderStatusHistoryEntityChangeType,
  OrderEntityStatus,
  OrderEntityPaymentStatus,
  OrderStatusHistoryEntityNote,
} from "@/shared/api";
import {
  historyActorLabel,
  historyChangeLabel,
  historyNoteLabel,
  isRefusedPaymentEvent,
} from "./history-label";
import { dict } from "@/shared/config";

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
    note: null,
    rejectedPaymentStatus: null,
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

// TASK-932 / TASK-788: the note is the part of the row an operator must not miss.
describe("historyNoteLabel", () => {
  it("names a shipment made without a confirmed online payment", () => {
    expect(
      historyNoteLabel(
        makeEntry({ note: OrderStatusHistoryEntityNote.SHIPPED_UNPAID }),
      ),
    ).toBe(dict.orderStatus.unpaidShipHistoryNote);
  });

  it("names a payment that arrived after the order was cancelled", () => {
    expect(
      historyNoteLabel(
        makeEntry({
          changeType: OrderStatusHistoryEntityChangeType.PAYMENT_STATUS,
          note: OrderStatusHistoryEntityNote.PAID_AFTER_CANCEL,
        }),
      ),
    ).toBe(dict.orderStatus.paidAfterCancelHistoryNote);
  });

  it("is null on an ordinary row", () => {
    expect(historyNoteLabel(makeEntry({ note: null }))).toBeNull();
  });
});

// TASK-621: the row the webhook writes when it refuses an event.
describe("refused payment events", () => {
  const refused = (overrides: Partial<OrderStatusHistoryEntity> = {}) =>
    makeEntry({
      changeType: OrderStatusHistoryEntityChangeType.PAYMENT_STATUS,
      fromPaymentStatus: OrderEntityPaymentStatus.PAID,
      toPaymentStatus: OrderEntityPaymentStatus.PAID,
      note: OrderStatusHistoryEntityNote.PAYMENT_EVENT_REFUSED,
      rejectedPaymentStatus: OrderEntityPaymentStatus.FAILED,
      ...overrides,
    });

  it("names what the event asked for and what stayed", () => {
    expect(historyChangeLabel(refused())).toBe(
      dict.orderStatus.paymentEventRefusedLabel("Помилка оплати", "Оплачено"),
    );
    expect(historyNoteLabel(refused())).toBe(
      dict.orderStatus.paymentEventRefusedHistoryNote,
    );
    expect(isRefusedPaymentEvent(refused())).toBe(true);
  });

  it("reads a legacy from = to row with no note as a refusal too", () => {
    const legacy = refused({ note: null, rejectedPaymentStatus: null });

    expect(isRefusedPaymentEvent(legacy)).toBe(true);
    expect(historyChangeLabel(legacy)).toBe(
      dict.orderStatus.paymentEventRefusedLegacyLabel("Оплачено"),
    );
    expect(historyChangeLabel(legacy)).not.toBe("Оплата: Оплачено → Оплачено");
  });

  it("does not flag an ordinary payment move or a status row", () => {
    expect(
      isRefusedPaymentEvent(
        makeEntry({
          changeType: OrderStatusHistoryEntityChangeType.PAYMENT_STATUS,
          fromPaymentStatus: OrderEntityPaymentStatus.PENDING,
          toPaymentStatus: OrderEntityPaymentStatus.PAID,
        }),
      ),
    ).toBe(false);
    expect(
      isRefusedPaymentEvent(
        makeEntry({
          fromStatus: OrderEntityStatus.PENDING,
          toStatus: OrderEntityStatus.PENDING,
        }),
      ),
    ).toBe(false);
  });
});
