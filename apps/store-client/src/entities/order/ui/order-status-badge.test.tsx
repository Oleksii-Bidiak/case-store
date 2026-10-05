import { render, screen } from "@testing-library/react";
import { OrderStatusBadge } from "./order-status-badge";

const badgeOf = (text: string) =>
  screen.getByText(text).closest('[data-slot="badge"]');

describe("OrderStatusBadge (TASK-868)", () => {
  it("renders through the shared Badge as a pill with the mapped variant", () => {
    render(<OrderStatusBadge status="DELIVERED">Доставлено</OrderStatusBadge>);

    const badge = badgeOf("Доставлено");
    expect(badge).toHaveAttribute("data-variant", "tint-success");
    expect(badge).toHaveAttribute("data-status", "DELIVERED");
    expect(badge).toHaveClass("px-3", "py-1", "rounded-full", "text-xs");
  });

  it("keeps the label in the foreground colour whatever the group", () => {
    for (const status of ["SHIPPED", "PAID", "REFUNDED", "FAILED"]) {
      const { unmount } = render(
        <OrderStatusBadge status={status}>{status}</OrderStatusBadge>,
      );
      expect(badgeOf(status)).toHaveClass("text-foreground");
      unmount();
    }
  });

  it("carries the colour in a decorative dot hidden from screen readers", () => {
    render(<OrderStatusBadge status="CANCELLED">Скасовано</OrderStatusBadge>);

    const dot = badgeOf("Скасовано")?.querySelector('[data-slot="badge-dot"]');
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveClass("bg-destructive");
  });

  it("merges the stage shade over the primary tint, leaving one background", () => {
    render(<OrderStatusBadge status="SHIPPED">Відправлено</OrderStatusBadge>);

    const badge = badgeOf("Відправлено");
    expect(badge).toHaveClass("bg-primary/30");
    expect(badge).not.toHaveClass("bg-primary/10");
  });

  it("paints an unknown status in the neutral fallback", () => {
    render(<OrderStatusBadge status="SOMETHING_NEW">?</OrderStatusBadge>);

    expect(badgeOf("?")).toHaveAttribute("data-variant", "tint-muted");
  });

  it("names itself with plain sr-only text, never an aria-label on a span", () => {
    render(
      <OrderStatusBadge status="PENDING" srLabel="Статус замовлення">
        Очікує підтвердження
      </OrderStatusBadge>,
    );

    const badge = badgeOf("Очікує підтвердження");
    expect(badge).not.toHaveAttribute("aria-label");
    expect(badge).toHaveTextContent("Статус замовлення: Очікує підтвердження");
    expect(screen.getByText("Статус замовлення:")).toHaveClass("sr-only");
  });
});
