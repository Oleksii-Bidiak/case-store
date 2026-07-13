import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminSidebar } from "./admin-sidebar";

// usePathname is unavailable under jsdom — pin the active route to the dashboard.
jest.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

const LOGO_URL = "http://localhost:3001/uploads/branding/logo.webp";

/** Override the shared seo-settings handler with a logo set (TASK-299). */
function stubLogo(logoUrl: string | null) {
  server.use(
    http.get("*/api/seo-settings", () =>
      HttpResponse.json({
        data: {
          id: "00000000-0000-0000-0000-000000000002",
          defaultMetaTitle: null,
          defaultMetaDescription: null,
          titleTemplate: null,
          defaultOgImage: null,
          logoUrl,
          noindexSite: false,
          llmsTxtSummary: null,
          additionalSameAsLinks: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ),
  );
}

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

  describe("brand mark (TASK-299)", () => {
    it("shows the uploaded store logo when one is set", async () => {
      stubLogo(LOGO_URL);

      renderWithProviders(<AdminSidebar />);

      const logo = await screen.findByAltText(dict.brand);
      expect(logo).toHaveAttribute("src", LOGO_URL);
      // The wordmark is replaced by the logo, not duplicated beside it.
      expect(screen.queryByText(dict.brand)).not.toBeInTheDocument();
    });

    it("falls back to the icon + wordmark when no logo is uploaded", async () => {
      stubLogo(null);

      renderWithProviders(<AdminSidebar />);

      expect(
        await screen.findByRole("link", { name: dict.nav.dashboard }),
      ).toBeInTheDocument();
      expect(screen.getByText(dict.brand)).toBeInTheDocument();
      expect(screen.queryByAltText(dict.brand)).not.toBeInTheDocument();
    });
  });
});
