import { render, screen, within } from "@testing-library/react";
import type { OrderEntityStatus } from "@/entities/order";
import { dict } from "@/shared/config";
import { OrderClosedStrip, OrderStatusTimeline } from "./order-status-timeline";

const t = dict.order.detail;
const PLACED = "1 жовтня 2026";

function steps(status: OrderEntityStatus) {
  render(<OrderStatusTimeline status={status} placedOn={PLACED} />);
  const list = screen.getByRole("list", { name: t.stepsAria });
  return within(list).getAllByRole("listitem");
}

const states = (items: HTMLElement[]) =>
  items.map((item) => item.getAttribute("data-state"));

describe("OrderStatusTimeline (TASK-217)", () => {
  it.each([
    ["PENDING", ["current", "next", "next", "next"], 0],
    ["CONFIRMED", ["done", "current", "next", "next"], 1],
    ["PROCESSING", ["done", "current", "next", "next"], 1],
    ["SHIPPED", ["done", "done", "current", "next"], 2],
  ] as const)(
    "%s: stages %j, the current one marked aria-current=step",
    (status, expected, current) => {
      const items = steps(status);
      expect(items).toHaveLength(4);
      expect(states(items)).toEqual(expected);

      const marked = items.filter((item) => item.hasAttribute("aria-current"));
      expect(marked).toEqual([items[current]]);
      expect(items[current]).toHaveAttribute("aria-current", "step");
    },
  );

  it("DELIVERED: all four stages done, none current", () => {
    const items = steps("DELIVERED");
    expect(states(items)).toEqual(["done", "done", "done", "done"]);
    expect(items.some((item) => item.hasAttribute("aria-current"))).toBe(false);
  });

  it("says each stage's state in words for a screen reader", () => {
    const items = steps("SHIPPED");
    expect(items[0]).toHaveTextContent(`${t.steps[0]}, ${t.stepDoneSr}`);
    expect(items[3]).toHaveTextContent(`${t.steps[3]}, ${t.stepNextSr}`);
    // The current stage is named by aria-current, not by a word.
    expect(items[2]).not.toHaveTextContent(t.stepDoneSr);
  });

  it("dates «Оформлено» always — even on a PENDING order", () => {
    const items = steps("PENDING");
    expect(items[0]).toHaveTextContent(PLACED);
    expect(items[0]).toHaveTextContent(dict.order.orderStatusLabels.PENDING);
  });

  it("puts «В обробці» under «Підтверджено» on a PROCESSING order", () => {
    const items = steps("PROCESSING");
    expect(items[0]).toHaveTextContent(PLACED);
    expect(items[1]).toHaveTextContent(dict.order.orderStatusLabels.PROCESSING);
  });

  it("does not repeat «Відправлено» under «Відправлено» on a SHIPPED order", () => {
    const items = steps("SHIPPED");
    // The stage name once (plus nothing under it), not twice.
    expect(items[2].textContent?.split(t.steps[2]).length).toBe(2);
  });

  it.each(["CANCELLED", "REFUNDED"] as const)(
    "draws nothing for a closed (%s) order",
    (status) => {
      const { container } = render(
        <OrderStatusTimeline status={status} placedOn={PLACED} />,
      );
      expect(container).toBeEmptyDOMElement();
    },
  );
});

describe("OrderClosedStrip (TASK-217)", () => {
  it("says the order was cancelled, with its date", () => {
    render(<OrderClosedStrip status="CANCELLED" placedOn={PLACED} />);
    const strip = screen.getByTestId("order-closed-strip");
    expect(strip).toHaveTextContent(t.closedCancelled);
    expect(strip).toHaveTextContent(t.placedOn(PLACED));
  });

  it("says «Повернення коштів» for a REFUNDED order", () => {
    render(<OrderClosedStrip status="REFUNDED" placedOn={PLACED} />);
    expect(screen.getByTestId("order-closed-strip")).toHaveTextContent(
      t.closedRefunded,
    );
  });
});
