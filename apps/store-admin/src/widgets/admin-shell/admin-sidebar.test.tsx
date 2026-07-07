import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { AdminSidebar } from "./admin-sidebar";

// usePathname is unavailable under jsdom — pin the active route to the dashboard.
jest.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// The nav body (links + TASK-248 badges) is covered in depth by
// admin-nav-list.test.tsx; this is a thin smoke test that the desktop rail still
// renders the brand and delegates to AdminNavList. Counter endpoints fall back
// to the shared MSW handlers (all-clear), so no per-test stub is needed.
describe("AdminSidebar", () => {
  it("renders the brand and reaches the nav through AdminNavList", async () => {
    renderWithProviders(<AdminSidebar />);

    expect(screen.getByText("MobileStore")).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: dict.nav.dashboard }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.nav.orders }),
    ).toBeInTheDocument();
  });
});
