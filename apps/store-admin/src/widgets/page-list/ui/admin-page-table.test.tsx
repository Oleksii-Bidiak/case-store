import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminPageTable } from "./admin-page-table";

function makePageRow(
  id: string,
  title: string,
  isActive: boolean,
  slug = title.toLowerCase().replace(/\s+/g, "-"),
) {
  return {
    id,
    slug,
    title,
    content: "<p>Body</p>",
    excerpt: null,
    metaTitle: null,
    metaDescription: null,
    isActive,
    sortOrder: 0,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

function stubPages(rows: ReturnType<typeof makePageRow>[]) {
  server.use(
    http.get("*/api/admin/pages", () =>
      HttpResponse.json({
        data: rows,
        meta: { total: rows.length, page: 1, limit: 100, totalPages: 1 },
      }),
    ),
  );
}

describe("AdminPageTable", () => {
  it("renders page rows with title, slug, and status badge", async () => {
    stubPages([
      makePageRow("page-1", "Privacy Policy", true, "privacy-policy"),
      makePageRow("page-2", "FAQ", false, "faq"),
    ]);

    renderWithProviders(<AdminPageTable />);

    await waitFor(() =>
      expect(screen.getByText("Privacy Policy")).toBeInTheDocument(),
    );
    expect(screen.getByText("privacy-policy")).toBeInTheDocument();
    expect(screen.getByText("FAQ")).toBeInTheDocument();
    expect(screen.getByText("faq")).toBeInTheDocument();
  });

  it("shows the published badge for active pages and draft for inactive", async () => {
    stubPages([
      makePageRow("page-1", "Privacy Policy", true),
      makePageRow("page-2", "FAQ", false),
    ]);

    renderWithProviders(<AdminPageTable />);

    await waitFor(() =>
      expect(screen.getByText(dict.pages.statusPublished)).toBeInTheDocument(),
    );
    expect(screen.getByText(dict.pages.statusDraft)).toBeInTheDocument();
  });

  it("renders an edit action linking to the page edit route", async () => {
    stubPages([makePageRow("page-1", "Privacy Policy", true)]);

    renderWithProviders(<AdminPageTable />);

    const editLink = await screen.findByRole("link", {
      name: dict.common.edit,
    });
    expect(editLink).toHaveAttribute("href", "/pages/page-1/edit");
  });
});
