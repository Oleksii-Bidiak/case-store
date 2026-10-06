import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { AccountView } from "./account-view";

// next/navigation is not available under jsdom — mock it. The section comes
// from `?section=` (TASK-867), and the profile section's claimed-orders banner
// (TASK-485) reads the URL too, so the query is mutable per test.
let mockSearch = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

const d = dict.account.dashboard;

beforeEach(() => {
  mockSearch = "";
});

describe("AccountView", () => {
  it("renders the profile section when no section is given", async () => {
    renderWithProviders(<AccountView />, { auth: { isAuthenticated: true } });

    expect(
      await screen.findByRole("heading", { level: 1, name: d.profileHeading }),
    ).toBeInTheDocument();
  });

  it("renders the section named by ?section= (TASK-867)", async () => {
    mockSearch = "section=settings";
    renderWithProviders(<AccountView />, { auth: { isAuthenticated: true } });

    expect(
      await screen.findByRole("heading", { level: 1, name: d.settingsHeading }),
    ).toBeInTheDocument();
  });

  it("falls back to the profile for an unknown section", async () => {
    mockSearch = "section=bogus";
    renderWithProviders(<AccountView />, { auth: { isAuthenticated: true } });

    expect(
      await screen.findByRole("heading", { level: 1, name: d.profileHeading }),
    ).toBeInTheDocument();
  });

  it("points the purchases placeholder at the order history inside the account", async () => {
    mockSearch = "section=purchases";
    renderWithProviders(<AccountView />, { auth: { isAuthenticated: true } });

    expect(
      await screen.findByRole("link", { name: d.purchasesCta }),
    ).toHaveAttribute("href", "/account/orders");
  });

  it("renders only the content column — the frame is AccountShell", async () => {
    renderWithProviders(<AccountView />, { auth: { isAuthenticated: true } });

    await screen.findByRole("heading", { level: 1, name: d.profileHeading });
    expect(
      screen.queryByRole("navigation", { name: d.navAria }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: d.backHome }),
    ).not.toBeInTheDocument();
  });
});
