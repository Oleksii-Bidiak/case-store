import { render, screen, userEvent, waitFor } from "@/shared/test/render";
import {
  AccountDropdown,
  AccountDropdownItem,
  AccountDropdownSeparator,
} from "./account-dropdown";

function setup(
  itemProps: Partial<React.ComponentProps<typeof AccountDropdownItem>> = {},
) {
  const onLogout = jest.fn();
  render(
    <>
      <button type="button">before</button>
      <AccountDropdown
        triggerContent={<span>icon</span>}
        triggerAria="Відкрити меню акаунту"
        menuAria="Меню акаунту"
      >
        <AccountDropdownItem href="/account">Мій акаунт</AccountDropdownItem>
        <AccountDropdownItem href="/orders">Мої замовлення</AccountDropdownItem>
        <AccountDropdownSeparator />
        <AccountDropdownItem onClick={onLogout} {...itemProps}>
          Вийти
        </AccountDropdownItem>
      </AccountDropdown>
      <button type="button">after</button>
    </>,
  );
  return { onLogout };
}

const triggerName = "Відкрити меню акаунту";
const getTrigger = () => screen.getByRole("button", { name: triggerName });

/** Keyboard-open the menu and wait for Radix to focus the first item. */
async function openWithEnter(user: ReturnType<typeof userEvent.setup>) {
  getTrigger().focus();
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(screen.getByRole("menuitem", { name: "Мій акаунт" })).toHaveFocus(),
  );
}

describe("AccountDropdown", () => {
  it("renders an APG menu button, collapsed, with no menu in the DOM", () => {
    setup();
    const trigger = getTrigger();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("gives the trigger a 44×44 minimum touch target", () => {
    setup();
    const trigger = getTrigger();
    expect(trigger).toHaveClass("min-h-11", "min-w-11");
    expect(trigger).not.toHaveClass("h-9", "w-9");
  });

  it("merges triggerClassName over the trigger defaults", () => {
    render(
      <AccountDropdown
        triggerContent={<span>icon</span>}
        triggerAria={triggerName}
        menuAria="Меню акаунту"
        triggerClassName="flex rounded-lg"
      >
        <AccountDropdownItem href="/account">Мій акаунт</AccountDropdownItem>
      </AccountDropdown>,
    );
    const trigger = getTrigger();
    expect(trigger).toHaveClass("flex", "rounded-lg", "min-h-11");
    // cn() resolves the conflicts instead of emitting both.
    expect(trigger).not.toHaveClass("inline-flex");
    expect(trigger).not.toHaveClass("rounded-md");
  });

  it("opens on click, names the menu with menuAria and wires aria-controls", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(getTrigger());

    const menu = screen.getByRole("menu", { name: "Меню акаунту" });
    expect(menu).not.toHaveAttribute("aria-labelledby");
    expect(getTrigger()).toHaveAttribute("aria-expanded", "true");
    expect(getTrigger()).toHaveAttribute("aria-controls", menu.id);
    // A pointer open focuses the panel; the first ArrowDown enters the items.
    await waitFor(() => expect(menu).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Мій акаунт" })).toHaveFocus();
  });

  it("portals the panel out of the trigger's wrapper (TASK-503)", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(getTrigger());

    const wrapper = getTrigger().parentElement as HTMLElement;
    expect(wrapper).not.toContainElement(screen.getByRole("menu"));
  });

  it("caps the panel at the available height and scrolls inside it (TASK-503)", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(getTrigger());

    expect(screen.getByRole("menu")).toHaveClass(
      "max-h-(--radix-dropdown-menu-content-available-height)",
      "overflow-y-auto",
    );
  });

  it("keeps the old panel and item surface, items on the menu-item radius", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(getTrigger());

    expect(screen.getByRole("menu")).toHaveClass(
      "min-w-48",
      "rounded-md",
      "border-border",
      "bg-popover",
      "shadow-elevated",
    );
    expect(screen.getByRole("menuitem", { name: "Мій акаунт" })).toHaveClass(
      "rounded-menu",
      "px-3",
      "py-2",
      "text-sm",
    );
  });

  it.each(["{Enter}", " ", "{ArrowDown}"])(
    "opens with %s from the trigger and focuses the first item",
    async (key) => {
      const user = userEvent.setup();
      setup();
      getTrigger().focus();

      await user.keyboard(key);

      await waitFor(() =>
        expect(
          screen.getByRole("menuitem", { name: "Мій акаунт" }),
        ).toHaveFocus(),
      );
    },
  );

  it("opens with ArrowUp from the trigger and focuses the last item", async () => {
    const user = userEvent.setup();
    setup();
    getTrigger().focus();

    await user.keyboard("{ArrowUp}");

    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "Вийти" })).toHaveFocus(),
    );
  });

  it("cycles with the arrows (wrapping) and jumps with Home/End", async () => {
    const user = userEvent.setup();
    setup();
    await openWithEnter(user);
    const first = screen.getByRole("menuitem", { name: "Мій акаунт" });
    const last = screen.getByRole("menuitem", { name: "Вийти" });

    await user.keyboard("{ArrowUp}");
    expect(last).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(first).toHaveFocus();
    await user.keyboard("{End}");
    expect(last).toHaveFocus();
    await user.keyboard("{Home}");
    expect(first).toHaveFocus();
  });

  it("skips the separator during arrow-key navigation", async () => {
    const user = userEvent.setup();
    setup();
    await openWithEnter(user);

    // account → orders → (separator skipped) → logout
    await user.keyboard("{ArrowDown}{ArrowDown}");

    expect(screen.getByRole("menuitem", { name: "Вийти" })).toHaveFocus();
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(getTrigger());
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(getTrigger()).toHaveFocus();
  });

  it("closes on Tab and moves focus on to the trigger's Tab neighbour", async () => {
    const user = userEvent.setup();
    setup();
    await openWithEnter(user);

    await user.keyboard("{Tab}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "after" })).toHaveFocus();
  });

  it("closes on Shift+Tab and moves focus back past the trigger", async () => {
    const user = userEvent.setup();
    setup();
    await openWithEnter(user);

    await user.keyboard("{Shift>}{Tab}{/Shift}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "before" })).toHaveFocus();
  });

  it("runs the item handler, closes, and returns focus to the trigger on select", async () => {
    const user = userEvent.setup();
    const { onLogout } = setup();

    await user.click(getTrigger());
    await user.click(screen.getByRole("menuitem", { name: "Вийти" }));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() => expect(getTrigger()).toHaveFocus());
  });

  it("selects the focused item with Enter", async () => {
    const user = userEvent.setup();
    const { onLogout } = setup();
    getTrigger().focus();
    await user.keyboard("{ArrowUp}");
    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "Вийти" })).toHaveFocus(),
    );

    await user.keyboard("{Enter}");

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renders link items as links to their href", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(getTrigger());

    expect(
      screen.getByRole("menuitem", { name: "Мої замовлення" }),
    ).toHaveAttribute("href", "/orders");
  });

  it("closes on an outside click without trapping the page (non-modal)", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(getTrigger());
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "after" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("skips a disabled item and does not run its handler", async () => {
    const user = userEvent.setup();
    const { onLogout } = setup({ disabled: true });
    await openWithEnter(user);

    // ArrowUp from the first item wraps to the last ENABLED item (orders).
    await user.keyboard("{ArrowUp}");

    expect(
      screen.getByRole("menuitem", { name: "Мої замовлення" }),
    ).toHaveFocus();
    expect(screen.getByRole("menuitem", { name: "Вийти" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(onLogout).not.toHaveBeenCalled();
  });
});
