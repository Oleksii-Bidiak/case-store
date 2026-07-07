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
    accessToken: null,
    isAuthenticated: true,
    isAdmin: true,
    isInitializing: false,
    setTokens: jest.fn(),
    clearTokens: jest.fn(),
  }),
  useAuthControllerLogout: () => ({ mutate: jest.fn(), isPending: false }),
}));

const openMenu = { name: dict.header.openMenu };

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
      within(dialog).getByRole("heading", { name: "MobileStore" }),
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
      http.get("*/api/admin/dashboard/needs-action", () =>
        HttpResponse.json({
          data: {
            newOrders: 5,
            pendingReviews: 1,
            unpaidInTransit: 0,
            failedMails: 0,
          },
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
