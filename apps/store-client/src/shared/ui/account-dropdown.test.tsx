import { render, screen, userEvent } from "@/shared/test/render";
import { AccountDropdown, AccountDropdownItem } from "./account-dropdown";

function setup(
  itemProps: Partial<React.ComponentProps<typeof AccountDropdownItem>> = {},
) {
  const onLogout = jest.fn();
  render(
    <>
      <button type="button">outside</button>
      <AccountDropdown
        triggerContent={<span>icon</span>}
        triggerAria="Відкрити меню акаунту"
        menuAria="Меню акаунту"
      >
        <AccountDropdownItem href="/account">Мій акаунт</AccountDropdownItem>
        <AccountDropdownItem href="/orders">Мої замовлення</AccountDropdownItem>
        <li
          role="separator"
          aria-hidden="true"
          className="my-1 border-t border-border"
        />
        <AccountDropdownItem onClick={onLogout} {...itemProps}>
          Вийти
        </AccountDropdownItem>
      </AccountDropdown>
    </>,
  );
  return { onLogout };
}

const triggerName = "Відкрити меню акаунту";

describe("AccountDropdown", () => {
  it("renders the trigger collapsed with no menu in the DOM initially", () => {
    setup();
    const trigger = screen.getByRole("button", { name: triggerName });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens on trigger click and focuses the first item", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: triggerName }));

    expect(screen.getByRole("button", { name: triggerName })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Мій акаунт" })).toHaveFocus();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    setup();
    const trigger = screen.getByRole("button", { name: triggerName });

    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("advances focus to the next item on ArrowDown", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: triggerName }));
    await user.keyboard("{ArrowDown}");

    expect(
      screen.getByRole("menuitem", { name: "Мої замовлення" }),
    ).toHaveFocus();
  });

  it("wraps from the first item to the last on ArrowUp", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: triggerName }));
    await user.keyboard("{ArrowUp}");

    expect(screen.getByRole("menuitem", { name: "Вийти" })).toHaveFocus();
  });

  it("skips the separator during arrow-key navigation", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: triggerName }));
    // account → orders → (separator skipped) → logout
    await user.keyboard("{ArrowDown}{ArrowDown}");

    expect(screen.getByRole("menuitem", { name: "Вийти" })).toHaveFocus();
    // Three focusable items only; the separator is not one of them.
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  });

  it("calls the item handler, closes, and returns focus to the trigger on activate", async () => {
    const user = userEvent.setup();
    const { onLogout } = setup();
    const trigger = screen.getByRole("button", { name: triggerName });

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Вийти" }));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes when a mousedown occurs outside the panel", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: triggerName }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "outside" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not focus a disabled item", async () => {
    const user = userEvent.setup();
    setup({ disabled: true });

    await user.click(screen.getByRole("button", { name: triggerName }));
    await user.keyboard("{ArrowUp}");

    // ArrowUp from the first item wraps to the last enabled item (orders),
    // skipping the disabled logout entry.
    expect(
      screen.getByRole("menuitem", { name: "Мої замовлення" }),
    ).toHaveFocus();
  });
});
