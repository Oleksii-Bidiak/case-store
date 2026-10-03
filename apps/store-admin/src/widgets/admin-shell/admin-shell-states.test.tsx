import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { AuthContextValue } from "@/entities/session";
import { AdminShell } from "./admin-shell";
import { AdminShellGuard } from "./admin-shell-guard";

/**
 * Wave 198 (TASK-1034) — the two shell states the AdminShell artboard adds:
 * П6 «права не завантажились» (TASK-1014) and П7 «сесія закінчилась»
 * (TASK-528 + TASK-974). Rendered with the REAL session context shape (the
 * fixture), so the shell reads exactly the fields the provider exposes.
 */

const mockReplace = jest.fn();
let mockPathname = "/orders";
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));

beforeEach(() => {
  mockReplace.mockReset();
  mockPathname = "/orders";
  server.use(
    http.get("*/api/contact/admin/unread-count", () =>
      HttpResponse.json({ data: { unread: 0 } }),
    ),
  );
});

function renderShell(auth: Partial<AuthContextValue>) {
  return renderWithProviders(
    <AdminShellGuard>
      <AdminShell>
        <p>page content</p>
      </AdminShell>
    </AdminShellGuard>,
    { auth },
  );
}

describe("AdminShell — permissions failed to load (TASK-1014)", () => {
  it("replaces the page with an explanation and leaves only «Панель» in the menu", () => {
    renderShell({ isOwner: false, permissionsFailed: true });

    const card = screen.getByRole("alert");
    expect(
      within(card).getByText(dict.header.permissionsErrorTitle),
    ).toBeInTheDocument();
    expect(
      within(card).getByText(dict.header.permissionsErrorBody),
    ).toBeInTheDocument();
    expect(screen.queryByText("page content")).not.toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([dict.nav.dashboard]);
  });

  it("refetches the permissions from «Повторити»", async () => {
    const retryPermissions = jest.fn();
    const user = userEvent.setup();
    renderShell({ isOwner: false, permissionsFailed: true, retryPermissions });

    await user.click(screen.getByRole("button", { name: dict.canon.retry }));

    expect(retryPermissions).toHaveBeenCalledTimes(1);
  });

  it("renders the page as usual when the permissions loaded", () => {
    renderShell({ isOwner: true });

    expect(screen.getByText("page content")).toBeInTheDocument();
    expect(
      screen.queryByText(dict.header.permissionsErrorTitle),
    ).not.toBeInTheDocument();
  });
});

describe("AdminShell — session expired (TASK-528 + TASK-974)", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("shows a dialog with one way out instead of a silent redirect", () => {
    renderShell({ isOwner: true, isSessionExpired: true });

    const dialog = screen.getByRole("alertdialog", {
      name: dict.header.sessionExpiredTitle,
    });
    expect(
      within(dialog).getByText(dict.header.sessionExpiredBody),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByRole("button")).toHaveLength(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("cannot be dismissed with Escape", async () => {
    const user = userEvent.setup();
    renderShell({ isOwner: true, isSessionExpired: true });

    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("alertdialog", {
        name: dict.header.sessionExpiredTitle,
      }),
    ).toBeInTheDocument();
  });

  it("sends «Увійти знову» to /login with the page to come back to", async () => {
    window.history.replaceState({}, "", "/orders?status=PENDING&page=2");
    const clearTokens = jest.fn();
    const user = userEvent.setup();
    renderShell({ isOwner: true, isSessionExpired: true, clearTokens });

    await user.click(
      screen.getByRole("button", { name: dict.header.sessionExpiredAction }),
    );

    expect(clearTokens).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    const target = new URL(mockReplace.mock.calls[0][0], "http://localhost");
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("next")).toBe(
      "/orders?status=PENDING&page=2",
    );
    expect(target.searchParams.get("reason")).toBe("session");
  });

  it("keeps the plain guard redirect for a browser that was never signed in", () => {
    renderShell({ isStaff: false, isAuthenticated: false, accessToken: null });

    expect(mockReplace).toHaveBeenCalledWith("/login");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("does not bounce to /login once the expired session is cleared", () => {
    renderShell({
      isStaff: false,
      isAuthenticated: false,
      accessToken: null,
      isSessionExpired: true,
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
