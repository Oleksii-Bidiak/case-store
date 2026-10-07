import { render, screen } from "@testing-library/react";

import { dict } from "@/shared/config";
import { DeltaBadge } from "./DeltaBadge";

/** TASK-692 — the change next to every report number (`.dl`, ДН-8.1). */

const d = dict.analytics;
const badge = (container: HTMLElement) =>
  container.querySelector('[data-slot="delta-badge"]') as HTMLElement;

describe("DeltaBadge", () => {
  it("shows a rise in green, with the sentence for a screen reader", () => {
    const { container } = render(<DeltaBadge changePct={12} />);
    const el = badge(container);
    expect(el).toHaveClass("text-success");
    expect(el).toHaveAttribute("data-trend", "up");
    expect(el).toHaveTextContent("+12%");
    expect(screen.getByText(d.deltaUp("12%"))).toHaveClass("sr-only");
  });

  it("shows a fall in red with a true minus sign", () => {
    const { container } = render(<DeltaBadge changePct={-4} />);
    const el = badge(container);
    expect(el).toHaveClass("text-destructive");
    expect(el).toHaveAttribute("data-trend", "down");
    expect(el).toHaveTextContent("−4%");
    expect(el.textContent).not.toContain("-4");
    expect(screen.getByText(d.deltaDown("4%"))).toBeInTheDocument();
  });

  it("shows no change as muted 0%", () => {
    const { container } = render(<DeltaBadge changePct={0} />);
    const el = badge(container);
    expect(el).toHaveClass("text-muted-foreground");
    expect(el).toHaveAttribute("data-trend", "flat");
    expect(el).toHaveTextContent("0%");
    expect(screen.getByText(d.deltaFlat)).toBeInTheDocument();
  });

  it("shows «—» when there was nothing before", () => {
    const { container } = render(<DeltaBadge changePct={null} />);
    const el = badge(container);
    expect(el).toHaveClass("text-muted-foreground");
    expect(el).toHaveAttribute("data-trend", "none");
    expect(el).toHaveTextContent("—");
    expect(el.textContent).not.toContain("%");
    expect(screen.getByText(d.deltaNone)).toBeInTheDocument();
  });

  it("paints a rise red and a fall green when lower is better", () => {
    const { container: up } = render(
      <DeltaBadge changePct={19} goodWhen="down" />,
    );
    expect(badge(up)).toHaveClass("text-destructive");
    expect(badge(up)).toHaveAttribute("data-trend", "up");

    const { container: down } = render(
      <DeltaBadge changePct={-6} goodWhen="down" />,
    );
    expect(badge(down)).toHaveClass("text-success");
    expect(badge(down)).toHaveAttribute("data-trend", "down");
  });

  it("formats percentage points with a decimal comma", () => {
    const { container } = render(<DeltaBadge changePct={1.4} unit="pp" />);
    expect(badge(container)).toHaveTextContent("+1,4 п. п.");
    expect(screen.getByText(d.deltaUp("1,4 п. п."))).toBeInTheDocument();
  });
});
