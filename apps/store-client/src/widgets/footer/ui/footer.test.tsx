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
    kind: "LEGAL",
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

/** Stub the three endpoints Footer() reads. Pages default to an empty list. */
function mockFooterData(
  pages: PageEntity[] = [],
  seo: { logoUrl?: string | null; siteName?: string | null } | null = null,
) {
  server.use(
    http.get("*/api/site-contact", () => HttpResponse.json({ data: null })),
    // The footer reads LEGAL and INFO separately; answer each with its kind,
    // as the API does.
    http.get("*/api/pages", ({ request }) => {
      const kind = new URL(request.url).searchParams.get("kind");
      return HttpResponse.json({
        data: pages.filter((page) => !kind || page.kind === kind),
        meta: {},
      });
    }),
    http.get("*/api/seo-settings", () => HttpResponse.json({ data: seo })),
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

describe("Footer — help pages and the two hubs (TASK-834)", () => {
  it("links every published help page at /info/<slug>, but not the ones /info inlines", async () => {
    mockFooterData([
      makePage({
        id: "p-help",
        slug: "returns-howto",
        kind: "INFO",
        title: "Як повернути товар",
      }),
      makePage({
        id: "p-about",
        slug: "about",
        kind: "INFO",
        title: "Про нас (CMS)",
      }),
      makePage({
        id: "p-del",
        slug: "info-delivery",
        kind: "INFO",
        title: "Доставка (блок /info)",
      }),
    ]);

    render(await Footer());

    expect(
      screen.getByRole("link", { name: "Як повернути товар" }),
    ).toHaveAttribute("href", "/info/returns-howto");
    // Inlined pages live on /info itself — no second address in the footer.
    expect(
      screen.queryByRole("link", { name: "Про нас (CMS)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Доставка (блок /info)" }),
    ).not.toBeInTheDocument();
    // A help page is never offered as a legal document.
    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("href") === "/legal/returns-howto"),
    ).toHaveLength(0);
  });

  it("always links the /info hub, and the /legal hub when there are documents", async () => {
    mockFooterData([makePage()]);

    render(await Footer());

    expect(
      screen.getByRole("link", { name: dict.footer.infoHelpHub }),
    ).toHaveAttribute("href", "/info");
    expect(
      screen.getByRole("link", { name: dict.footer.infoLegalHub }),
    ).toHaveAttribute("href", "/legal");
  });

  it("omits the /legal hub link when no legal document is published", async () => {
    mockFooterData([]);

    render(await Footer());

    expect(
      screen.queryByRole("link", { name: dict.footer.infoLegalHub }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.footer.infoHelpHub }),
    ).toHaveAttribute("href", "/info");
  });
});

describe("Footer — store logo (TASK-299)", () => {
  it("renders the typographic wordmark when no logo is uploaded", async () => {
    mockFooterData([], { logoUrl: null });

    render(await Footer());

    // The brand link is the wordmark — unchanged from before the Logo component.
    expect(screen.getByRole("link", { name: "CaseStore" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(document.querySelector("footer img")).not.toBeInTheDocument();
  });

  it("renders the uploaded logo (alt = brand name) inside the home link", async () => {
    const logoUrl = "http://localhost:3001/uploads/branding/logo.svg";
    mockFooterData([], { logoUrl });

    render(await Footer());

    const img = screen.getByRole("img", { name: "CaseStore" });
    expect(img).toHaveAttribute("src", logoUrl);
    // The link's accessible name still resolves to the brand, via the alt text.
    expect(screen.getByRole("link", { name: "CaseStore" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});

describe("Footer — store name (TASK-546)", () => {
  it("prints the admin-managed name in the wordmark and the © line", async () => {
    mockFooterData([], { logoUrl: null, siteName: "  Аксесуарня " });

    render(await Footer());

    expect(screen.getByRole("link", { name: "Аксесуарня" })).toHaveAttribute(
      "href",
      "/",
    );
    const year = new Date().getFullYear();
    expect(
      screen.getByText(dict.footer.rights(year, "Аксесуарня")),
    ).toBeInTheDocument();
    // Nothing of the code default is left on a renamed store.
    expect(screen.queryByText(/CaseStore/)).not.toBeInTheDocument();
  });

  it("names an uploaded logo with the admin-managed name too", async () => {
    const logoUrl = "http://localhost:3001/uploads/branding/logo.svg";
    mockFooterData([], { logoUrl, siteName: "Аксесуарня" });

    render(await Footer());

    expect(screen.getByRole("img", { name: "Аксесуарня" })).toHaveAttribute(
      "src",
      logoUrl,
    );
  });

  it("falls back to the default name in the © line when none is set", async () => {
    mockFooterData([], { logoUrl: null, siteName: null });

    render(await Footer());

    const year = new Date().getFullYear();
    expect(
      screen.getByText(dict.footer.rights(year, "CaseStore")),
    ).toBeInTheDocument();
  });
});
