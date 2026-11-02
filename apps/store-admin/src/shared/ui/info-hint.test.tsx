import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { dict } from "@/shared/config";
import { InfoHint } from "./info-hint";
import { LabelTooltip } from "./tooltip";

const HINT = "Товару вже немає в наявності або його знято з продажу.";

/**
 * TASK-1978. A native `title` shows nothing on a touch screen or on keyboard
 * focus and gives no hint that there is anything to read. These pin what the
 * replacement promises: a named, focusable trigger with a visible «ⓘ», the
 * explanation on tap/click (and Escape to close), on focus, and as the
 * button's description for assistive tech.
 */
describe("InfoHint", () => {
  it("is a button named by the chip text and described by the hint", () => {
    render(
      <InfoHint hint={HINT} badgeVariant="destructive">
        Позиція недоступна
      </InfoHint>,
    );

    const trigger = screen.getByRole("button", { name: "Позиція недоступна" });
    expect(trigger).toHaveAccessibleDescription(HINT);
    // The explanation lives in no `title` any more.
    expect(trigger).not.toHaveAttribute("title");
    expect(trigger).toHaveAttribute("data-slot", "info-hint");
  });

  it("names a bare «ⓘ» «Пояснення» unless told otherwise", () => {
    const { rerender } = render(<InfoHint hint={HINT} />);
    expect(
      screen.getByRole("button", { name: dict.common.infoHintAria }),
    ).toHaveAccessibleDescription(HINT);

    rerender(<InfoHint hint={HINT} label="Що рахує колонка" />);
    expect(
      screen.getByRole("button", { name: "Що рахує колонка" }),
    ).toBeInTheDocument();
  });

  it("opens the explanation on a click (a tap) and closes it on Escape", async () => {
    const user = userEvent.setup();
    render(<InfoHint hint={HINT}>Позиція недоступна</InfoHint>);
    const trigger = screen.getByRole("button", { name: "Позиція недоступна" });

    await user.click(trigger);
    const popover = await screen.findByRole("dialog");
    expect(popover).toHaveTextContent(HINT);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });

  it("opens from the keyboard alone", async () => {
    const user = userEvent.setup();
    render(<InfoHint hint={HINT}>Позиція недоступна</InfoHint>);

    await user.tab();
    expect(
      screen.getByRole("button", { name: "Позиція недоступна" }),
    ).toHaveFocus();
    // Focus alone shows the quick tooltip…
    expect(await screen.findByRole("tooltip")).toHaveTextContent(HINT);

    // …and Enter pins it as the popover, replacing the tooltip.
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toHaveTextContent(HINT);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows the hint as a tooltip on hover", async () => {
    const user = userEvent.setup();
    render(<InfoHint hint={HINT}>Позиція недоступна</InfoHint>);

    await user.hover(
      screen.getByRole("button", { name: "Позиція недоступна" }),
    );

    expect(await screen.findByRole("tooltip")).toHaveTextContent(HINT);
  });
});

describe("LabelTooltip", () => {
  it("shows an icon-only button's name on focus without renaming it", async () => {
    const user = userEvent.setup();
    render(
      <LabelTooltip label="Копіювати номер">
        <button type="button" aria-label="Копіювати номер">
          <svg aria-hidden="true" />
        </button>
      </LabelTooltip>,
    );

    await user.tab();
    const button = screen.getByRole("button", { name: "Копіювати номер" });
    expect(button).toHaveFocus();
    expect(button).not.toHaveAttribute("title");
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Копіювати номер",
    );
  });
});
