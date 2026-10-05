import { renderWithProviders, screen, within } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { AccountShell } from "./account-shell";

// next/navigation is not available under jsdom. The shell reads both the
// pathname and the query, so both are mutable per test.
const mockReplace = jest.fn();
let mockPathname = "/account";
let mockSearch = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

const d = dict.account.dashboard;

function at(pathname: string, search = "") {
  mockPathname = pathname;
  mockSearch = search;
}

function renderShell(
  auth: { isAuthenticated: boolean; isInitializing?: boolean } = {
    isAuthenticated: true,
  },
) {
  return renderWithProviders(
    <AccountShell>
      <p>route content</p>
    </AccountShell>,
    { auth },
  );
}

/** The sidebar (lg+) and the chip strip (below lg) — both labelled navs. */
async function navs() {
  await screen.findByText("route content");
  expect(screen.getAllByRole("navigation", { name: d.navAria })).toHaveLength(
    2,
  );
  const sidebar = within(screen.getByTestId("account-aside")).getByRole(
    "navigation",
    { name: d.navAria },
  );
  const strip = screen.getByTestId("account-strip");
  return { sidebar, strip };
}

beforeEach(() => {
  mockReplace.mockClear();
  at("/account");
});

describe("AccountShell (TASK-217 / TASK-867)", () => {
  it("frames the route: back link, sidebar, strip, content", async () => {
    renderShell();
    const { sidebar, strip } = await navs();

    expect(screen.getByRole("link", { name: d.backHome })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByTestId("account-aside")).toHaveClass(
      "hidden",
      "lg:block",
      "lg:w-66",
    );
    expect(strip).toHaveAccessibleName(d.navAria);
    expect(strip).toHaveClass("lg:hidden", "overflow-x-auto");
    expect(sidebar).toContainElement(
      within(sidebar).getByRole("link", { name: d.nav.orders }),
    );
    expect(screen.getByRole("button", { name: d.logout })).toBeInTheDocument();
  });

  it("links every entry to its URL in both menus", async () => {
    renderShell();
    const { sidebar, strip } = await navs();

    for (const nav of [sidebar, strip]) {
      const link = (name: string) => within(nav).getByRole("link", { name });
      expect(link(d.nav.profile)).toHaveAttribute("href", "/account");
      expect(link(d.nav.orders)).toHaveAttribute("href", "/account/orders");
      expect(link(d.nav.favorites)).toHaveAttribute("href", "/wishlist");
      expect(link(d.nav.settings)).toHaveAttribute(
        "href",
        "/account?section=settings",
      );
    }
  });

  it("marks the profile active on /account in both menus", async () => {
    renderShell();
    const { sidebar, strip } = await navs();

    for (const nav of [sidebar, strip]) {
      const current = within(nav).getByRole("link", { current: "page" });
      expect(current).toHaveAccessibleName(d.nav.profile);
    }
  });

  it("marks the section named by ?section=", async () => {
    at("/account", "section=settings");
    renderShell();
    const { sidebar, strip } = await navs();

    const active = within(sidebar).getByRole("link", { current: "page" });
    expect(active).toHaveAccessibleName(d.nav.settings);
    // Token tint, not an inline colour (TASK-879).
    expect(active).toHaveClass("bg-primary/10", "text-primary");
    expect(active).not.toHaveAttribute("style");

    const chip = within(strip).getByRole("link", { current: "page" });
    expect(chip).toHaveAccessibleName(d.nav.settings);
    expect(chip).toHaveClass(
      "bg-primary",
      "text-primary-foreground",
      "h-11",
      "border-chip",
    );

    const idle = within(strip).getByRole("link", { name: d.nav.bonuses });
    expect(idle).not.toHaveAttribute("aria-current");
    expect(idle).toHaveClass("bg-card", "border-chip", "border-border");
  });

  it("treats an unknown section as the profile", async () => {
    at("/account", "section=bogus");
    renderShell();
    const { sidebar } = await navs();

    expect(
      within(sidebar).getByRole("link", { current: "page" }),
    ).toHaveAccessibleName(d.nav.profile);
  });

  it("marks «Історія замовлень» on the order list", async () => {
    at("/account/orders");
    renderShell();
    const { sidebar, strip } = await navs();

    for (const nav of [sidebar, strip]) {
      expect(
        within(nav).getByRole("link", { current: "page" }),
      ).toHaveAccessibleName(d.nav.orders);
    }
  });

  it("on an order detail drops the strip and hides back-home below lg", async () => {
    at("/account/orders/0b5e7c1a-1111-4222-8333-444455556666");
    renderShell();
    await screen.findByText("route content");

    // Only the sidebar menu is left, and it still marks the orders entry.
    const menus = screen.getAllByRole("navigation", { name: d.navAria });
    expect(menus).toHaveLength(1);
    expect(screen.queryByTestId("account-strip")).not.toBeInTheDocument();
    expect(
      within(menus[0]).getByRole("link", { current: "page" }),
    ).toHaveAccessibleName(d.nav.orders);

    expect(screen.getByRole("link", { name: d.backHome })).toHaveClass(
      "hidden",
      "lg:inline-flex",
    );
  });

  it("shows the greeting from the profile", async () => {
    renderShell();
    await screen.findByText("route content");
    expect(screen.getByText(/^Привіт, /)).toBeInTheDocument();
  });

  it("renders the skeleton, not the route, while the session initialises", () => {
    renderShell({ isAuthenticated: false, isInitializing: true });

    expect(screen.getByTestId("account-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("route content")).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("fills the content column with the order list's skeleton on /account/orders", () => {
    at("/account/orders", "status=active");
    renderWithProviders(
      <AccountShell ordersSkeleton={<p>orders skeleton</p>}>
        <p>route content</p>
      </AccountShell>,
      { auth: { isAuthenticated: false, isInitializing: true } },
    );

    expect(
      within(screen.getByTestId("account-skeleton-content")).getByText(
        "orders skeleton",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("account-profile-skeleton"),
    ).not.toBeInTheDocument();
  });

  it("fills the content column with the order detail's skeleton on /account/orders/<id>", () => {
    at("/account/orders/0b5e7c1a-1111-4222-8333-444455556666");
    renderWithProviders(
      <AccountShell
        ordersSkeleton={<p>orders skeleton</p>}
        orderDetailSkeleton={<p>detail skeleton</p>}
      >
        <p>route content</p>
      </AccountShell>,
      { auth: { isAuthenticated: false, isInitializing: true } },
    );

    expect(
      within(screen.getByTestId("account-skeleton-content")).getByText(
        "detail skeleton",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("orders skeleton")).not.toBeInTheDocument();
  });

  it("keeps the order list's skeleton off the order detail and the profile", () => {
    at("/account/orders/abc");
    const { unmount } = renderWithProviders(
      <AccountShell ordersSkeleton={<p>orders skeleton</p>}>
        <p>route content</p>
      </AccountShell>,
      { auth: { isAuthenticated: false, isInitializing: true } },
    );
    expect(screen.queryByText("orders skeleton")).not.toBeInTheDocument();
    unmount();

    at("/account");
    renderWithProviders(
      <AccountShell ordersSkeleton={<p>orders skeleton</p>}>
        <p>route content</p>
      </AccountShell>,
      { auth: { isAuthenticated: false, isInitializing: true } },
    );
    expect(screen.queryByText("orders skeleton")).not.toBeInTheDocument();
    expect(screen.getByTestId("account-profile-skeleton")).toBeInTheDocument();
  });

  it("sends a signed-out visitor to the login with the full path and query", () => {
    at("/account/orders", "status=active&page=2");
    renderShell({ isAuthenticated: false });

    expect(mockReplace).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent("/account/orders?status=active&page=2")}`,
    );
    expect(screen.queryByText("route content")).not.toBeInTheDocument();
  });

  it("returns a signed-out visitor to the exact section", () => {
    at("/account", "section=settings");
    renderShell({ isAuthenticated: false });

    expect(mockReplace).toHaveBeenCalledWith(
      "/login?redirect=%2Faccount%3Fsection%3Dsettings",
    );
  });

  it("redirects without a dangling ? when there is no query", () => {
    at("/account/orders/abc");
    renderShell({ isAuthenticated: false });

    expect(mockReplace).toHaveBeenCalledWith(
      "/login?redirect=%2Faccount%2Forders%2Fabc",
    );
  });
});
