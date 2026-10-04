import type { OrderStatusHistoryEntity } from "@/entities/order";
import { orderPath } from "./order-path";

const CREATED = "2026-06-01T10:00:00.000Z";

const move = (toStatus: string, changedAt: string) =>
  ({
    id: `h-${toStatus}`,
    orderId: "o-1",
    changeType: "STATUS",
    fromStatus: null,
    toStatus,
    fromPaymentStatus: null,
    toPaymentStatus: null,
    changedBy: null,
    note: null,
    rejectedPaymentStatus: null,
    changedAt,
  }) as unknown as OrderStatusHistoryEntity;

const states = (steps: ReturnType<typeof orderPath>) =>
  steps.map((step) => step.state);

describe("orderPath — the order path of the card (К1)", () => {
  it("marks the steps behind as done and the current one as now", () => {
    const steps = orderPath({ status: "CONFIRMED", createdAt: CREATED }, [
      move("CONFIRMED", "2026-06-01T10:31:00.000Z"),
    ]);
    expect(states(steps)).toEqual(["done", "now", "todo", "todo", "todo"]);
    expect(steps[0].title).toBe("Створено");
    expect(steps[1].description).toMatch(/13:31/);
  });

  it("calls a jumped-over step skipped once the history is known", () => {
    const steps = orderPath({ status: "SHIPPED", createdAt: CREATED }, [
      move("SHIPPED", "2026-06-02T10:00:00.000Z"),
    ]);
    expect(states(steps)).toEqual(["done", "skip", "skip", "now", "todo"]);
  });

  it("does not guess before the history has loaded", () => {
    expect(
      states(
        orderPath({ status: "PROCESSING", createdAt: CREATED }, undefined),
      ),
    ).toEqual(["done", "done", "now", "todo", "todo"]);
  });

  it("ends at «Доставлено» as done", () => {
    expect(
      states(orderPath({ status: "DELIVERED", createdAt: CREATED }, [])).at(-1),
    ).toBe("done");
  });

  it("shows a cancelled order's reached steps as done and the rest skipped", () => {
    expect(
      states(
        orderPath({ status: "CANCELLED", createdAt: CREATED }, [
          move("CONFIRMED", "2026-06-01T11:00:00.000Z"),
          move("CANCELLED", "2026-06-01T12:00:00.000Z"),
        ]),
      ),
    ).toEqual(["done", "done", "skip", "skip", "skip"]);
  });
});
