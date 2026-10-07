import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { RemoveUnavailableButton } from "./remove-unavailable-button";

/**
 * TASK-657: the label IS the accessible name, and it counts LINES with the
 * Ukrainian plural — literal strings here, so a broken `pluralUk` call in the
 * dictionary cannot pass by being compared against itself.
 */
describe("RemoveUnavailableButton (TASK-657)", () => {
  it.each([
    [1, "Прибрати 1 недоступний товар"],
    [2, "Прибрати 2 недоступні товари"],
    [5, "Прибрати 5 недоступних товарів"],
    [21, "Прибрати 21 недоступний товар"],
  ])("names %i line(s) «%s»", (count, name) => {
    renderWithProviders(
      <RemoveUnavailableButton count={count} onClick={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  });

  it("calls onClick when idle", async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    renderWithProviders(
      <RemoveUnavailableButton count={3} onClick={onClick} />,
    );

    await user.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled while busy, yet keeps focus where the keyboard left it", async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    renderWithProviders(
      <RemoveUnavailableButton count={3} pending onClick={onClick} />,
    );
    const button = screen.getByRole("button", {
      name: "Прибрати 3 недоступні товари",
    });

    // aria-disabled, not `disabled`: still focusable, so focus is not dropped.
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-busy", "true");
    await user.tab();
    expect(button).toHaveFocus();

    await user.keyboard("{Enter}");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
