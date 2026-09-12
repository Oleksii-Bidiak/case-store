import { ThemeProvider } from "next-themes";
import {
  renderWithProviders,
  screen,
  userEvent,
  type RenderResult,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import { HeaderThemeToggle } from "./header-theme-toggle";

/** The three option labels, shared with the account settings copy. */
const LABEL = {
  light: dict.account.dashboard.themeLight,
  system: dict.account.dashboard.themeSystem,
  dark: dict.account.dashboard.themeDark,
} as const;

/**
 * Render the switch inside a REAL next-themes provider rather than a mocked
 * `useTheme`: the behaviour worth protecting is end-to-end — a click must reach
 * `<html data-theme>` and localStorage, which a mock would quietly fake.
 *
 * The jsdom `matchMedia` stub (shared/test/setup.ts) answers `matches: false`,
 * so "system" resolves to light here. That is what makes the "choice, not
 * resolved theme" assertion below meaningful.
 */
function renderToggle(
  props: Partial<React.ComponentProps<typeof HeaderThemeToggle>> = {},
): RenderResult {
  return renderWithProviders(
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      <HeaderThemeToggle {...props} />
    </ThemeProvider>,
  );
}

const radio = (name: string) => screen.getByRole("radio", { name });

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("HeaderThemeToggle", () => {
  it("exposes a named group with the three themes as radios", () => {
    renderToggle();

    const group = screen.getByRole("radiogroup", {
      name: dict.header.themeAria,
    });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    for (const label of Object.values(LABEL)) {
      expect(radio(label)).toBeInTheDocument();
    }
  });

  it("marks the stored choice, not the theme it resolves to", () => {
    // "system" resolves to light under the matchMedia stub — the control must
    // still show "Системна" as the selection.
    window.localStorage.setItem("theme", "system");
    renderToggle();

    expect(radio(LABEL.system)).toHaveAttribute("aria-checked", "true");
    expect(radio(LABEL.light)).toHaveAttribute("aria-checked", "false");
    expect(radio(LABEL.dark)).toHaveAttribute("aria-checked", "false");
  });

  it("applies a picked theme to the document and remembers it", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(radio(LABEL.dark));

    expect(radio(LABEL.dark)).toHaveAttribute("aria-checked", "true");
    expect(radio(LABEL.system)).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");

    // …and back to light, so the switch is proven to work in both directions.
    await user.click(radio(LABEL.light));

    expect(radio(LABEL.light)).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("moves the selection with the arrow keys, wrapping at the ends", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("theme", "system");
    renderToggle();

    radio(LABEL.system).focus();

    await user.keyboard("{ArrowRight}");
    expect(radio(LABEL.dark)).toHaveAttribute("aria-checked", "true");
    expect(radio(LABEL.dark)).toHaveFocus();

    // Past the last segment the selection wraps to the first one.
    await user.keyboard("{ArrowRight}");
    expect(radio(LABEL.light)).toHaveAttribute("aria-checked", "true");

    await user.keyboard("{ArrowLeft}");
    expect(radio(LABEL.dark)).toHaveAttribute("aria-checked", "true");

    await user.keyboard("{Home}");
    expect(radio(LABEL.light)).toHaveAttribute("aria-checked", "true");

    await user.keyboard("{End}");
    expect(radio(LABEL.dark)).toHaveAttribute("aria-checked", "true");
  });

  it("is a single tab stop — Tab reaches the selected segment only", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("theme", "dark");
    renderToggle();

    await user.tab();
    expect(radio(LABEL.dark)).toHaveFocus();

    // The other two are removed from the tab order (roving tabIndex), so the
    // next Tab leaves the group instead of walking through it.
    await user.tab();
    expect(radio(LABEL.light)).not.toHaveFocus();
    expect(radio(LABEL.system)).not.toHaveFocus();
  });

  it("labels the segments visibly in the full variant", () => {
    renderToggle({ variant: "full" });

    // The caption is the group's accessible name in both variants; in `full` it
    // is on screen, and each segment shows its label next to the icon.
    expect(
      screen.getByRole("radiogroup", { name: dict.header.themeAria }),
    ).toBeInTheDocument();
    expect(radio(LABEL.system)).toHaveTextContent(LABEL.system);
  });
});
