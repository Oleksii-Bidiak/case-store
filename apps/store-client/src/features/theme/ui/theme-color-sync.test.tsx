import { ThemeProvider } from "next-themes";
import {
  renderWithProviders,
  screen,
  userEvent,
  type RenderResult,
} from "@/shared/test/render";
import { THEME_COLOR, dict } from "@/shared/config";
import { ThemeToggle } from "./theme-toggle";
import { THEME_COLOR_OVERRIDE_ATTR, ThemeColorSync } from "./theme-color-sync";

/**
 * A real next-themes provider, as in theme-toggle.test.tsx: the behaviour worth
 * protecting is that a click on the switch reaches `<head>`, which a mocked
 * `useTheme` would fake. The toggle is rendered alongside only to drive it.
 */
function renderSync(): RenderResult {
  return renderWithProviders(
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      <ThemeToggle />
      <ThemeColorSync />
    </ThemeProvider>,
  );
}

const overrides = () =>
  document.head.querySelectorAll<HTMLMetaElement>(
    `meta[${THEME_COLOR_OVERRIDE_ATTR}]`,
  );

/** What a browser would pick: the first theme-color meta whose media matches. */
function effectiveThemeColor(): string | null {
  for (const meta of document.head.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    const media = meta.getAttribute("media");
    if (!media || window.matchMedia(media).matches) return meta.content;
  }
  return null;
}

/** The static pair the root layout's `viewport.themeColor` renders. */
function addMediaPair() {
  for (const [scheme, color] of [
    ["light", THEME_COLOR.light],
    ["dark", THEME_COLOR.dark],
  ] as const) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    // Attribute, not the `media` property: jsdom does not reflect
    // HTMLMetaElement.media, so a property write would leave no attribute.
    meta.setAttribute("media", `(prefers-color-scheme: ${scheme})`);
    meta.content = color;
    document.head.append(meta);
  }
}

const radio = (name: string) => screen.getByRole("radio", { name });

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.head.innerHTML = "";
  addMediaPair();
});

describe("ThemeColorSync", () => {
  it("adds nothing in system mode — the media pair stays in charge", () => {
    renderSync();
    expect(overrides()).toHaveLength(0);
  });

  it("puts the stored explicit choice first in <head> on mount", () => {
    window.localStorage.setItem("theme", "dark");
    renderSync();

    const [meta] = overrides();
    expect(meta).toBeDefined();
    expect(meta).toBe(document.head.firstElementChild);
    expect(meta).toHaveAttribute("name", "theme-color");
    expect(meta).not.toHaveAttribute("media");
    expect(meta).toHaveAttribute("content", THEME_COLOR.dark);
    // The jsdom matchMedia stub answers `matches: false` for both queries, so
    // only the override can produce a colour here.
    expect(effectiveThemeColor()).toBe(THEME_COLOR.dark);
  });

  it("follows the switch and hands back to the pair on «Системна»", async () => {
    const user = userEvent.setup();
    renderSync();

    await user.click(radio(dict.account.dashboard.themeLight));
    expect(overrides()).toHaveLength(1);
    expect(effectiveThemeColor()).toBe(THEME_COLOR.light);

    await user.click(radio(dict.account.dashboard.themeDark));
    // Replaced, not stacked.
    expect(overrides()).toHaveLength(1);
    expect(effectiveThemeColor()).toBe(THEME_COLOR.dark);

    await user.click(radio(dict.account.dashboard.themeSystem));
    expect(overrides()).toHaveLength(0);
    // The static pair itself is never touched.
    expect(
      document.head.querySelectorAll('meta[name="theme-color"][media]'),
    ).toHaveLength(2);
  });

  it("removes its meta on unmount", () => {
    window.localStorage.setItem("theme", "light");
    const { unmount } = renderSync();
    expect(overrides()).toHaveLength(1);

    unmount();
    expect(overrides()).toHaveLength(0);
  });
});
