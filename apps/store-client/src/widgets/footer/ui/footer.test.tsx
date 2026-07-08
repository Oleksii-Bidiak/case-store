import { http, HttpResponse } from "msw";
import { render, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { PageEntity } from "@/shared/api/generated/models";
import { Footer } from "./footer";

/**
 * Footer is an async Server Component: it awaits `fetchSiteContactSettings()` and
 * `fetchPublishedPages()` (native tagged `fetch`), both intercepted by MSW here.
 * Tests render the resolved element with `render(await Footer())`.
 */

/** Build a minimal published PageEntity; override slug/title per-case. */
function makePage(overrides: Partial<PageEntity> = {}): PageEntity {
  return {
    id: "page-1",
    slug: "delivery",
    title: "Доставка й оплата",
    content: "<p>…</p>",
    status: "PUBLISHED",
    isActive: true,
    sortOrder: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Stub the two endpoints Footer() reads. Pages default to an empty list. */
function mockFooterData(pages: PageEntity[] = []) {
  server.use(
    http.get("*/api/site-contact", () => HttpResponse.json({ data: null })),
    http.get("*/api/pages", () => HttpResponse.json({ data: pages, meta: {} })),
  );
}

describe("Footer — «Інформація» column (TASK-184)", () => {
  it("renders published legal pages as /legal/<slug> links with their titles", async () => {
    const pages = [
      makePage({ slug: "delivery", title: "Доставка й оплата" }),
      makePage({ id: "page-2", slug: "warranty", title: "Гарантія та сервіс" }),
    ];
    mockFooterData(pages);

    render(await Footer());

    const delivery = screen.getByRole("link", { name: "Доставка й оплата" });
    expect(delivery).toHaveAttribute("href", "/legal/delivery");
    const warranty = screen.getByRole("link", { name: "Гарантія та сервіс" });
    expect(warranty).toHaveAttribute("href", "/legal/warranty");
  });

  it("still renders About/FAQ/Blog and no /legal link when no pages are published", async () => {
    mockFooterData([]);

    render(await Footer());

    expect(
      screen.getByRole("link", { name: dict.footer.infoAbout }),
    ).toHaveAttribute("href", "/info#about");
    expect(
      screen.getByRole("link", { name: dict.footer.infoFaq }),
    ).toHaveAttribute("href", "/info#faq");
    expect(
      screen.getByRole("link", { name: dict.footer.infoBlog }),
    ).toHaveAttribute("href", "/blog");

    const legalLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/legal/"));
    expect(legalLinks).toHaveLength(0);
  });

  it("points the About/FAQ anchors at the /info hub sections", async () => {
    mockFooterData([makePage()]);

    render(await Footer());

    expect(
      screen.getByRole("link", { name: dict.footer.infoAbout }),
    ).toHaveAttribute("href", "/info#about");
    expect(
      screen.getByRole("link", { name: dict.footer.infoFaq }),
    ).toHaveAttribute("href", "/info#faq");
  });

  it("no «Інформація» link points at the old /products placeholder", async () => {
    mockFooterData([makePage()]);

    render(await Footer());

    const productsLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === "/products");
    // The Каталог column legitimately links to /products; the regression guard is
    // that the info column's About/FAQ/legal links no longer do. Assert the info
    // labels specifically resolve off /products.
    expect(
      screen.getByRole("link", { name: dict.footer.infoAbout }),
    ).not.toHaveAttribute("href", "/products");
    expect(
      screen.getByRole("link", { name: dict.footer.infoFaq }),
    ).not.toHaveAttribute("href", "/products");
    // Only the Каталог "Усі товари" link should remain on bare /products.
    expect(productsLinks).toHaveLength(1);
  });
});
