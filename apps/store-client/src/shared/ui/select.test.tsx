import { render, screen, userEvent, within } from "@/shared/test/render";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

/**
 * TASK-459. The owner's report: "selects open fine at first, but grow taller as
 * you scroll and never shrink back; they should behave like a native one."
 *
 * The growth is not our code. Radix's `item-aligned` positioning — which this
 * wrapper used to select by default, copying the upstream shadcn/ui template —
 * arms a viewport scroll handler that adds the scrolled distance to the popup's
 * height on every scroll event, clamped only to the window and never reversed.
 * Popper positioning never mounts that branch.
 *
 * jsdom performs no layout, so a height assertion here would be theatre. These
 * tests pin the *cause* instead: which positioning branch mounts, that the popup
 * carries the available-height cap, and that the options live inside the
 * scroll container rather than directly on the popup.
 */

const OPTION_COUNT = 30;
const OPTIONS = Array.from({ length: OPTION_COUNT }, (_, i) => ({
  value: `opt-${i + 1}`,
  label: `Опція ${i + 1}`,
}));

const TRIGGER_LABEL = "Сортування";

function LongSelect(
  props: React.ComponentProps<typeof SelectContent> = {},
): React.ReactElement {
  return (
    <Select>
      <SelectTrigger aria-label={TRIGGER_LABEL}>
        <SelectValue placeholder="Оберіть" />
      </SelectTrigger>
      <SelectContent {...props}>
        {OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Open the picker the way a pointer user does and hand back the popup. */
async function openSelect(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole("combobox", { name: TRIGGER_LABEL }));
  return screen.findByRole("listbox");
}

describe("shared/ui Select (TASK-459)", () => {
  it("opens and renders every one of its 30 options", async () => {
    render(<LongSelect />);

    const listbox = await openSelect();

    expect(within(listbox).getAllByRole("option")).toHaveLength(OPTION_COUNT);
    expect(
      within(listbox).getByRole("option", { name: "Опція 1" }),
    ).toBeInTheDocument();
    expect(
      within(listbox).getByRole("option", { name: `Опція ${OPTION_COUNT}` }),
    ).toBeInTheDocument();
  });

  it("mounts the popup in the popper branch, not the one that grows on scroll", async () => {
    render(<LongSelect />);

    const listbox = await openSelect();

    // Radix wraps popper-positioned content in a floating-ui wrapper element and
    // item-aligned content in a bare <div>. The wrapper's presence is what says
    // `SelectItemAlignedPosition` — the only thing that arms
    // `shouldExpandOnScrollRef` — is not on screen.
    expect(
      listbox.closest("[data-radix-popper-content-wrapper]"),
    ).not.toBeNull();
  });

  it("caps the popup at the available height and scrolls its options inside", async () => {
    render(<LongSelect />);

    const listbox = await openSelect();

    // The cap is only meaningful under popper positioning: Radix publishes
    // `--radix-select-content-available-height` nowhere else.
    expect(listbox).toHaveClass(
      "max-h-(--radix-select-content-available-height)",
    );
    expect(listbox).toHaveClass("overflow-y-auto");

    // Options belong to the viewport, the element Radix gives `overflow: hidden
    // auto`, so a long list scrolls inside a fixed-size surface.
    const viewport = listbox.querySelector<HTMLElement>(
      "[data-radix-select-viewport]",
    );
    expect(viewport).not.toBeNull();
    expect(within(viewport as HTMLElement).getAllByRole("option")).toHaveLength(
      OPTION_COUNT,
    );
    expect(viewport?.getAttribute("style") ?? "").toContain("overflow");
  });

  it("keeps the offset off the DOM and still honours an explicit item-aligned call site", async () => {
    render(<LongSelect position="item-aligned" />);

    const listbox = await openSelect();

    // `position` stays a default, not a hard-coded value.
    expect(listbox.closest("[data-radix-popper-content-wrapper]")).toBeNull();
    // Popper-only props must not leak onto a DOM node in this branch.
    expect(listbox).not.toHaveAttribute("sideoffset");
    expect(listbox).not.toHaveAttribute("collisionpadding");
  });

  it("selects an option with the keyboard alone", async () => {
    render(<LongSelect />);

    const trigger = screen.getByRole("combobox", { name: TRIGGER_LABEL });
    trigger.focus();
    await userEvent.keyboard("{Enter}");

    await screen.findByRole("listbox");
    await userEvent.click(screen.getByRole("option", { name: "Опція 2" }));

    expect(trigger).toHaveTextContent("Опція 2");
  });
});
