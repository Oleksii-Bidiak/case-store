import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge", () => {
  it("keeps the default look for existing callers", () => {
    render(<Badge>Новинка</Badge>);

    const badge = screen.getByText("Новинка");
    expect(badge).toHaveAttribute("data-variant", "default");
    expect(badge).toHaveClass("bg-primary", "px-2", "py-0.5");
    expect(badge.querySelector('[data-slot="badge-dot"]')).toBeNull();
  });

  it("has a pill size with the order-screen padding (TASK-868)", () => {
    render(<Badge size="pill">Pill</Badge>);

    const badge = screen.getByText("Pill");
    expect(badge).toHaveClass("px-3", "py-1");
    expect(badge).not.toHaveClass("px-2");
  });

  it.each([
    ["tint-primary", "bg-primary/10", "bg-primary"],
    ["tint-success", "bg-success/15", "bg-success"],
    ["tint-destructive", "bg-destructive/10", "bg-destructive"],
    ["tint-muted", "bg-muted", "bg-muted-foreground"],
  ] as const)(
    "%s tints the pill, keeps foreground text and colours the dot",
    (variant, tint, dotColour) => {
      render(
        <Badge variant={variant} dot>
          {variant}
        </Badge>,
      );

      const badge = screen.getByText(variant);
      expect(badge).toHaveClass(tint, "text-foreground");
      const dot = badge.querySelector('[data-slot="badge-dot"]');
      expect(dot).toHaveAttribute("aria-hidden", "true");
      expect(dot).toHaveClass(dotColour);
    },
  );

  it("gives a non-tint badge a dot in its text colour", () => {
    render(
      <Badge variant="secondary" dot>
        Хіт
      </Badge>,
    );

    expect(
      screen.getByText("Хіт").querySelector('[data-slot="badge-dot"]'),
    ).toHaveClass("bg-current");
  });

  it("drops the dot with asChild, since Slot takes one child", () => {
    render(
      <Badge asChild dot variant="tint-success">
        <a href="/orders">Посилання</a>
      </Badge>,
    );

    const link = screen.getByRole("link", { name: "Посилання" });
    expect(link).toHaveAttribute("data-slot", "badge");
    expect(link.querySelector('[data-slot="badge-dot"]')).toBeNull();
  });
});
