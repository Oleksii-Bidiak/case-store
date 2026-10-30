import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  within,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminShell } from "./admin-shell";

// usePathname drives AdminNavList's active route + AdminShell's close-on-route
// backstop; useRouter is used by the header's LogoutButton. Pathname is a mutable
// module-level value so the backstop test can simulate a route change on rerender.
let mockPathname = "/";
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

// Decouple the shell from the real auth context/logout mutation.
jest.mock("@/entities/session", () => ({
  useAuth: () => ({
    userId: "admin-1",
    role: "ADMIN",
    email: "admin@example.com",
    accessToken: null,
    isAuthenticated: true,
    isStaff: true,
    isOwner: true,
    isInitializing: false,
    permissions: [],
    arePermissionsLoading: false,
    // Owner: holds everything, so the shell still renders the complete nav.
    can: () => true,
    canAll: () => true,
    setTokens: jest.fn(),
    clearTokens: jest.fn(),
  }),
  useAuthControllerLogout: () => ({ mutate: jest.fn(), isPending: false }),
}));

const openMenu = { name: dict.header.openMenu };

describe("AdminShell — page scroll container (TASK-1989)", () => {
  // jsdom has no layout, so the contract is asserted on the classes: the
  // <main> scroller must be the containing block of every absolutely
  // positioned descendant (sr-only radios, Radix hidden inputs), or those
  // inputs resolve to the initial containing block and give the VIEWPORT a
  // scroll range — focusing one, or following a #section anchor, then slides
  // the whole h-screen shell up behind body overflow-hidden.
  it("makes <main> the positioned scroll container", () => {
    renderWithProviders(<AdminShell>page content</AdminShell>);

    const main = screen.getByRole("main");
    expect(main).toHaveClass("relative");
    expect(main).toHaveClass("overflow-y-auto");
  });

  it("clips the shell wrappers so script/focus cannot scroll them", () => {
    renderWithProviders(<AdminShell>page content</AdminShell>);

    const main = screen.getByRole("main");
    const column = main.parentElement!;
    const shell = column.parentElement!;
    for (const wrapper of [column, shell]) {
      expect(wrapper).toHaveClass("overflow-clip");
      expect(wrapper).not.toHaveClass("overflow-hidden");
    }
  });

  it("lets the content column shrink below its content width", () => {
    // overflow-clip is not a scroll container, so the column's flex
    // `min-width: auto` would resolve to its content width: a wide table or
    // chip row would push it past the viewport, the outer clip would cut the
    // right edge off and <main> would lose its horizontal scroll.
    renderWithProviders(<AdminShell>page content</AdminShell>);

    const column = screen.getByRole("main").parentElement!;
    expect(column).toHaveClass("min-w-0");
  });
});

describe("AdminShell — a registry fills the page (TASK-1994)", () => {
  // jsdom has no layout, so the contract is asserted on the classes. A
  // registry's table box (`data-registry-fill`) scrolls on its own so its
  // header can stick; <main> scrolling as well made two vertical scrollers,
  // and scrolling <main> took the header away. From md up, the shell turns
  // <main> and every wrapper between it and the box into a shrinkable flex
  // column, so the box gets exactly the height left and <main> has nothing
  // to scroll.
  it("makes <main> a flex column when it holds a filling registry", () => {
    renderWithProviders(<AdminShell>page content</AdminShell>);

    const main = screen.getByRole("main");
    expect(main).toHaveClass(
      "md:has-[[data-registry-fill]]:flex",
      "md:has-[[data-registry-fill]]:flex-col",
    );
  });

  it("lets every wrapper around the registry shrink instead of overflowing <main>", () => {
    renderWithProviders(<AdminShell>page content</AdminShell>);

    const main = screen.getByRole("main");
    expect(main).toHaveClass(
      "md:[&_:has([data-registry-fill])]:flex",
      "md:[&_:has([data-registry-fill])]:flex-col",
      "md:[&_:has([data-registry-fill])]:min-h-0",
    );
  });

  it("keeps <main> scrollable — the fallback when the box hits its floor", () => {
    renderWithProviders(<AdminShell>page content</AdminShell>);

    expect(screen.getByRole("main")).toHaveClass("overflow-y-auto");
  });
});

describe("AdminShell — mobile nav drawer", () => {
  afterEach(() => {
    mockPathname = "/";
  });

  it("has no drawer dialog mounted until the burger is clicked", () => {
    renderWithProviders(<AdminShell>page content</AdminShell>);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the drawer (title + nav links) when the burger is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminShell>page content</AdminShell>);

    await user.click(screen.getByRole("button", openMenu));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "CaseStore" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: dict.nav.products }),
    ).toBeInTheDocument();
  });

  it("closes the drawer when a nav link inside it is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminShell>page content</AdminShell>);

    await user.click(screen.getByRole("button", openMenu));
    const dialog = await screen.findByRole("dialog");

    await user.click(
      within(dialog).getByRole("link", { name: dict.nav.products }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("closes the drawer on Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminShell>page content</AdminShell>);

    await user.click(screen.getByRole("button", openMenu));
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("closes the drawer on a route change (render-time backstop)", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <AdminShell>page content</AdminShell>,
    );

    await user.click(screen.getByRole("button", openMenu));
    await screen.findByRole("dialog");

    // Simulate a navigation that did not go through a drawer <Link> click
    // (e.g. browser back/forward): the pathname changes on the next render.
    mockPathname = "/orders";
    rerender(<AdminShell>page content</AdminShell>);

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("shows the TASK-248 count badges inside the open drawer", async () => {
    server.use(
      http.get("*/api/contact/admin/unread-count", () =>
        HttpResponse.json({ data: { unread: 2 } }),
      ),
      // TASK-722: the Orders / Reviews badges read each section's own list
      // total, not the analytics-only needs-action endpoint.
      http.get("*/api/admin/orders", () =>
        HttpResponse.json({
          data: [],
          meta: { total: 5, page: 1, limit: 1, totalPages: 5 },
        }),
      ),
      http.get("*/api/admin/reviews", () =>
        HttpResponse.json({
          data: [],
          meta: { total: 1, page: 1, limit: 1, totalPages: 1 },
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<AdminShell>page content</AdminShell>);

    await user.click(screen.getByRole("button", openMenu));
    const dialog = await screen.findByRole("dialog");

    // Scoped to the dialog: the desktop rail renders the same badges, so an
    // unscoped query would match twice.
    expect(
      await within(dialog).findByLabelText(
        dict.dashboard.newOrdersBadgeAria(5),
      ),
    ).toHaveTextContent("5");
    expect(
      within(dialog).getByLabelText(dict.dashboard.pendingReviewsBadgeAria(1)),
    ).toHaveTextContent("1");
    expect(
      within(dialog).getByLabelText(dict.messages.unreadBadgeAria(2)),
    ).toHaveTextContent("2");
  });
});
