import { renderToString } from "react-dom/server";
import { ThemeProvider } from "next-themes";
import {
  renderWithProviders,
  screen,
  userEvent,
  type RenderResult,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import { ThemeSwitchRow, ThemeToggleButton } from "./theme-switch";

/**
 * ThemeToggleButton / ThemeSwitchRow (TASK-2073) inside a REAL next-themes
 * provider, as theme-toggle.test.tsx does: the behaviour worth protecting is
 * that a click reaches `<html data-theme>` and localStorage.
 *
 * The OS scheme is what "system" resolves to, so each case sets it by swapping
 * `window.matchMedia` for one that answers `(prefers-color-scheme: dark)`.
 */
const originalMatchMedia = window.matchMedia;

function setOsScheme(scheme: "light" | "dark") {
  window.matchMedia = (query: string) =>
    ({
      matches:
        scheme === "dark" && query.includes("prefers-color-scheme: dark"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

function renderWithTheme(ui: React.ReactElement): RenderResult {
  return renderWithProviders(
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      {ui}
    </ThemeProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("ThemeToggleButton", () => {
  it("on a dark OS with no choice made, shows the moon and offers light", async () => {
    setOsScheme("dark");
    const user = userEvent.setup();
    renderWithTheme(<ThemeToggleButton />);

    const button = screen.getByRole("button", {
      name: dict.theme.enableLight,
    });
    expect(button).toHaveAttribute("title", dict.theme.enableLight);
    expect(button).not.toHaveAttribute("aria-pressed");
    // Both glyphs are rendered; the `dark:` variant (same rule as the page)
    // decides which is painted, so the icon is right before hydration too.
    const moon = button.querySelector(".lucide-moon");
    const sun = button.querySelector(".lucide-sun");
    expect(moon?.getAttribute("class")).toContain("dark:block");
    expect(sun?.getAttribute("class")).toContain("dark:hidden");

    await user.click(button);

    // The first click turns the implicit system theme into an explicit choice.
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem("theme")).toBe("light");
    expect(
      screen.getByRole("button", { name: dict.theme.enableDark }),
    ).toBeInTheDocument();
  });

  it("on a light OS offers dark, and toggles both ways", async () => {
    setOsScheme("light");
    const user = userEvent.setup();
    renderWithTheme(<ThemeToggleButton />);

    await user.click(
      screen.getByRole("button", { name: dict.theme.enableDark }),
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");

    await user.click(
      screen.getByRole("button", { name: dict.theme.enableLight }),
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem("theme")).toBe("light");
  });

  it("follows an explicit stored choice over the OS", () => {
    setOsScheme("light");
    window.localStorage.setItem("theme", "dark");
    renderWithTheme(<ThemeToggleButton />);

    expect(
      screen.getByRole("button", { name: dict.theme.enableLight }),
    ).toBeInTheDocument();
  });

  it("server-renders a neutral name — the effective theme is unknown there", () => {
    const html = renderToString(
      <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
        <ThemeToggleButton />
      </ThemeProvider>,
    );

    expect(html).toContain(`aria-label="${dict.theme.groupAria}"`);
    expect(html).not.toContain(dict.theme.enableDark);
    expect(html).not.toContain(dict.theme.enableLight);
  });
});

describe("ThemeSwitchRow", () => {
  it("is a switch named «Темна тема», ON for a dark OS with no choice made", async () => {
    setOsScheme("dark");
    const user = userEvent.setup();
    renderWithTheme(<ThemeSwitchRow />);

    const row = screen.getByRole("switch", { name: dict.theme.darkRow });
    expect(row).toHaveAttribute("aria-checked", "true");

    await user.click(row);

    expect(row).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem("theme")).toBe("light");
  });

  it("toggles from the keyboard — Space and Enter", async () => {
    setOsScheme("light");
    const user = userEvent.setup();
    renderWithTheme(<ThemeSwitchRow />);

    const row = screen.getByRole("switch", { name: dict.theme.darkRow });
    expect(row).toHaveAttribute("aria-checked", "false");

    await user.tab();
    expect(row).toHaveFocus();
    await user.keyboard(" ");
    expect(row).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

    await user.keyboard("{Enter}");
    expect(row).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("drives the track from the `dark:` variant, so it is right before hydration", () => {
    renderWithTheme(<ThemeSwitchRow />);

    const track = document.querySelector('[data-slot="theme-switch-track"]');
    expect(track).toHaveAttribute("aria-hidden", "true");
    expect(track?.getAttribute("class")).toContain("dark:bg-primary");
    expect(track?.firstElementChild?.getAttribute("class")).toContain(
      "dark:translate-x-5",
    );
  });
});
