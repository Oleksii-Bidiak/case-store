import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { AccountView } from "./account-view";

// next/navigation is not available under jsdom — mock the router.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

const d = dict.account.dashboard;

describe("AccountView", () => {
  it("renders the profile section by default and links orders/favorites to their pages", async () => {
    renderWithProviders(<AccountView />, { auth: { isAuthenticated: true } });

    expect(
      await screen.findByRole("heading", { level: 1, name: d.profileHeading }),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: d.nav.orders })).toHaveAttribute(
      "href",
      "/orders",
    );
    expect(screen.getByRole("link", { name: d.nav.favorites })).toHaveAttribute(
      "href",
      "/wishlist",
    );
  });

  it("switches to a stub section when its sidebar item is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountView />, { auth: { isAuthenticated: true } });

    await screen.findByRole("heading", { level: 1, name: d.profileHeading });

    await user.click(screen.getByRole("button", { name: d.nav.settings }));
    expect(
      screen.getByRole("heading", { level: 1, name: d.settingsHeading }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: d.nav.bonuses }));
    expect(
      screen.getByRole("heading", { level: 1, name: d.bonusesHeading }),
    ).toBeInTheDocument();
  });
});
