import { act, render, screen, userEvent, within } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { Stepper } from "./stepper";
import { RadioCard, RadioCardGroup } from "./radio-card";

/** Staff С4–С7: «Хто → Доступ → Запрошення». */
describe("Stepper", () => {
  const steps = [
    {
      id: "who",
      title: "Хто",
      description: "dmytro@example.com",
      state: "done",
    },
    {
      id: "access",
      title: "Доступ",
      description: "рівень і шаблон прав",
      state: "now",
    },
    {
      id: "invite",
      title: "Запрошення",
      description: "як людина увійде",
      state: "todo",
    },
  ] as const;

  it("marks the current step, the done ones and the rest", () => {
    render(<Stepper aria-label="Кроки" steps={steps} />);
    const list = screen.getByRole("list", { name: "Кроки" });
    const [who, access, invite] = within(list).getAllByRole("listitem");

    expect(access).toHaveAttribute("aria-current", "step");
    expect(who).not.toHaveAttribute("aria-current");
    expect(who).toHaveAttribute("data-state", "done");
    // «done» is said, not only drawn as a green tick.
    expect(who).toHaveTextContent(dict.canon.stepDone);
    expect(invite).toHaveAttribute("data-state", "todo");
    expect(access).toHaveTextContent("2");
    expect(access).toHaveTextContent("рівень і шаблон прав");
  });

  it("shows a skipped step faded and dashed, and says so", () => {
    render(
      <Stepper
        aria-label="Кроки"
        steps={[
          { id: "a", title: "Хто", state: "done" },
          { id: "b", title: "Доступ", state: "skip" },
          { id: "c", title: "Запрошення", state: "now" },
        ]}
      />,
    );
    const skipped = screen.getAllByRole("listitem")[1];
    expect(skipped).toHaveClass("border-dashed", "opacity-60");
    expect(skipped).toHaveTextContent(dict.canon.stepSkipped);
  });

  it("stacks on mobile and lays out in columns from md", () => {
    render(<Stepper aria-label="Кроки" steps={steps} />);
    expect(screen.getByRole("list")).toHaveClass(
      "grid-cols-1",
      "md:grid-cols-3",
    );
  });
});

/** Staff С5: «Рівень доступу» as cards with a title and an explanation. */
describe("RadioCard", () => {
  it("is a labelled radio group; the selected card is checked and outlined", async () => {
    const onValueChange = jest.fn();
    const user = userEvent.setup();
    render(
      <RadioCardGroup
        aria-label="Рівень доступу"
        value="manager"
        onValueChange={onValueChange}
      >
        <RadioCard
          value="manager"
          title="Менеджер"
          description="лише те, що йому видали"
        />
        <RadioCard
          value="admin"
          title="Адміністратор"
          description="повний доступ до всього"
        />
      </RadioCardGroup>,
    );
    const group = screen.getByRole("radiogroup", { name: "Рівень доступу" });
    const manager = within(group).getByRole("radio", { name: "Менеджер" });
    const admin = within(group).getByRole("radio", { name: "Адміністратор" });

    expect(manager).toBeChecked();
    expect(manager).toHaveAccessibleDescription("лише те, що йому видали");
    expect(manager).toHaveClass("data-[state=checked]:border-primary");
    expect(admin).not.toBeChecked();

    await user.click(admin);
    expect(onValueChange).toHaveBeenCalledWith("admin");
  });

  it("moves between cards with the arrow keys and picks with Space", async () => {
    const onValueChange = jest.fn();
    const user = userEvent.setup();
    render(
      <RadioCardGroup
        aria-label="Рівень"
        value="a"
        onValueChange={onValueChange}
      >
        <RadioCard value="a" title="A" />
        <RadioCard value="b" title="B" />
      </RadioCardGroup>,
    );
    act(() => screen.getByRole("radio", { name: "A" }).focus());
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "B" })).toHaveFocus();
    // (Radix also selects on arrow in a browser; that path needs real focus
    // events jsdom does not dispatch in order, so Space is asserted here.)
    await user.keyboard(" ");
    expect(onValueChange).toHaveBeenCalledWith("b");
  });
});
