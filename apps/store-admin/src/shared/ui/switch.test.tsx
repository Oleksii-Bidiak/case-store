import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "./switch";
import { Label } from "./label";

/**
 * TASK-436. The control this replaced was a bare `<input type="checkbox">` with
 * no associated label, so a screen reader announced an unnamed checkbox. These
 * pin the two things that made the replacement worth doing: it is reachable and
 * operable from the keyboard, and it carries a name.
 */
describe("Switch", () => {
  function renderSwitch(props: Partial<React.ComponentProps<typeof Switch>>) {
    return render(
      <div>
        <Switch id="flag" {...props} />
        <Label htmlFor="flag">Показувати у списках</Label>
      </div>,
    );
  }

  it("exposes itself as a named switch, not an anonymous box", () => {
    renderSwitch({ checked: true, onCheckedChange: jest.fn() });

    expect(
      screen.getByRole("switch", { name: "Показувати у списках" }),
    ).toBeChecked();
  });

  it("toggles from the keyboard", async () => {
    const onCheckedChange = jest.fn();
    renderSwitch({ checked: false, onCheckedChange });

    await userEvent.tab();
    await userEvent.keyboard(" ");

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("does not fire while disabled", async () => {
    const onCheckedChange = jest.fn();
    renderSwitch({ checked: false, onCheckedChange, disabled: true });

    await userEvent.click(screen.getByRole("switch"));

    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
