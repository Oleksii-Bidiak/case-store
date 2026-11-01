import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

/**
 * TASK-2079 — the Button's busy state (design-system §6 «Loading»): it keeps
 * the fill, the width and keyboard focus, shows a spinner and swallows clicks.
 */
describe("Button loading (TASK-2079)", () => {
  it("is busy, aria-disabled and spins — but not natively disabled", () => {
    render(<Button loading>Додаємо…</Button>);
    const button = screen.getByRole("button", { name: "Додаємо…" });

    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("data-loading");
    // Native `disabled` would paint the grey slab and drop focus to <body>.
    expect(button).toBeEnabled();
    expect(button.querySelector("svg.animate-spin")).not.toBeNull();
  });

  it("swallows clicks while loading and keeps focus", async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(
      <Button loading onClick={onClick}>
        Додаємо…
      </Button>,
    );
    const button = screen.getByRole("button");

    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is a plain button when not loading", async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Купити</Button>);
    const button = screen.getByRole("button", { name: "Купити" });

    expect(button).not.toHaveAttribute("aria-busy");
    expect(button).not.toHaveAttribute("aria-disabled");
    expect(button.querySelector("svg")).toBeNull();
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("hovers the graphite fill to primary-hover, not an invisible /90", () => {
    render(<Button>Купити</Button>);
    const button = screen.getByRole("button");

    expect(button).toHaveClass("hover:bg-primary-hover", "active:scale-98");
    expect(button).not.toHaveClass("hover:bg-primary/90");
  });
});
