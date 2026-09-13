import { ThemeProvider } from "next-themes";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { AccountSettingsSection } from "./account-settings-section";

const d = dict.account.dashboard;

/**
 * A real next-themes provider, not a mocked `useTheme` (same call as the
 * control's own test): what this section owes the visitor is that a choice made
 * HERE actually lands on the document and in localStorage, which a mock fakes.
 */
function renderSettings() {
  return renderWithProviders(
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      <AccountSettingsSection />
    </ThemeProvider>,
    { auth: { isAuthenticated: true } },
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("AccountSettingsSection", () => {
  it("puts the theme control in the appearance card, not a claim about it", () => {
    renderSettings();

    expect(
      screen.getByRole("heading", { name: d.appearanceHeading }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: dict.header.themeAria }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    for (const label of [d.themeLight, d.themeSystem, d.themeDark]) {
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
    }
  });

  it("no longer tells the visitor the theme adapts on its own", () => {
    // The regression this section shipped with (TASK-505): after TASK-412 added
    // a manual switch, the card still promised the theme "автоматично
    // підлаштовується" under the visitor. Any copy making that promise again
    // fails here.
    renderSettings();

    expect(screen.getByText(d.appearanceNote)).toBeInTheDocument();
    expect(screen.queryByText(/автоматично/i)).not.toBeInTheDocument();
  });

  it("changes the theme from the account page", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("radio", { name: d.themeDark }));

    expect(screen.getByRole("radio", { name: d.themeDark })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");

    // …and back, so the page is proven to drive the switch in both directions.
    await user.click(screen.getByRole("radio", { name: d.themeLight }));

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("still renders the notification toggles it owns", () => {
    renderSettings();

    expect(
      screen.getByRole("heading", { name: d.notificationsHeading }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(d.notifs.length);
  });
});
