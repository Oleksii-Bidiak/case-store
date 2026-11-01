import { http, HttpResponse } from "msw";
import {
  renderWithProviders as render,
  screen,
  userEvent,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type {
  PageEntity,
  SiteContactSettingsEntity,
} from "@/shared/api/generated/models";
import { Footer } from "./footer";

/**
 * Footer is an async Server Component: it awaits `fetchSiteContactSettings()`,
 * `fetchPublishedPages()`, `fetchSeoSettings()` (native tagged `fetch`) and the
 * root categories (Orval client), all intercepted by MSW here. Tests render the
 * resolved element with `render(await Footer())`.
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

const CATEGORIES = [
  { id: "c1", slug: "cases", name: "Чохли" },
  { id: "c2", slug: "screen-protectors", name: "Захисне скло" },
].map((c, i) => ({ ...c, isActive: true, sortOrder: i }));

interface FooterData {
  pages?: PageEntity[];
  seo?: { logoUrl?: string | null; siteName?: string | null } | null;
  contact?: Partial<SiteContactSettingsEntity> | null;
  /** `null` = the categories endpoint fails. */
  categories?: unknown[] | null;
}

/** Stub the endpoints Footer() reads. */
function mockFooterData({
  pages = [],
  seo = null,
  contact = null,
  categories = CATEGORIES,
}: FooterData = {}) {
  server.use(
    http.get("*/api/site-contact", () => HttpResponse.json({ data: contact })),
    http.get("*/api/categories", () =>
      categories
        ? HttpResponse.json({
            data: categories,
            meta: { total: categories.length, page: 1, limit: 20 },
          })
        : new HttpResponse(null, { status: 500 }),
    ),
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

/** The links panel a column's phone disclosure controls. */
function columnPanel(title: string): HTMLElement {
  const toggle = screen.getByRole("button", { name: title });
  const panel = document.getElementById(
    toggle.getAttribute("aria-controls") ?? "",
  );
  if (!panel) throw new Error(`no panel for ${title}`);
  return panel;
}

beforeEach(() => window.localStorage.clear());

describe("Footer — trust strip (TASK-2078)", () => {
  it("renders the four items with their subtitles and no free-delivery promise", async () => {
    mockFooterData();

    render(await Footer());

    const strip = screen.getByRole("list", { name: dict.footer.trustAria });
    const items = within(strip).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    dict.footer.trust.forEach(({ title, subtitle }, index) => {
      expect(items[index]).toHaveTextContent(title);
      expect(items[index]).toHaveTextContent(subtitle);
    });
    expect(strip).not.toHaveTextContent(/безкоштовн/i);
  });
});

describe("Footer — «Мої пристрої» row (TASK-2078)", () => {
  it("offers the device picker when no device is saved", async () => {
    mockFooterData();

    render(await Footer());

    expect(
      screen.getByRole("button", { name: dict.footer.device.choose }),
    ).toBeInTheDocument();
  });
});

describe("Footer — columns (TASK-2078)", () => {
  it("lists the root categories and «Усі категорії» under «Каталог»", async () => {
    mockFooterData();

    render(await Footer());

    const catalog = columnPanel(dict.footer.catalogTitle);
    expect(
      within(catalog).getByRole("link", { name: "Чохли" }),
    ).toHaveAttribute("href", "/categories/cases");
    expect(
      within(catalog).getByRole("link", { name: "Захисне скло" }),
    ).toHaveAttribute("href", "/categories/screen-protectors");
    expect(
      within(catalog).getByRole("link", {
        name: dict.footer.catalogAllCategories,
      }),
    ).toHaveAttribute("href", "/categories");
  });

  it("still renders with the categories endpoint down", async () => {
    mockFooterData({ categories: null });

    render(await Footer());

    const catalog = columnPanel(dict.footer.catalogTitle);
    expect(within(catalog).getAllByRole("link")).toHaveLength(1);
  });

  it("gives buyers my devices, wishlist and order status, and the company its four links", async () => {
    mockFooterData();

    render(await Footer());

    const buyers = columnPanel(dict.footer.buyersTitle);
    expect(
      within(buyers).getByRole("link", { name: dict.footer.buyersMyDevices }),
    ).toHaveAttribute("href", "/devices");
    expect(
      within(buyers).getByRole("link", { name: dict.footer.catalogWishlist }),
    ).toHaveAttribute("href", "/wishlist");
    expect(
      within(buyers).getByRole("link", { name: dict.footer.infoOrderStatus }),
    ).toHaveAttribute("href", "/orders/status");

    const company = columnPanel(dict.footer.companyTitle);
    expect(
      within(company)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/info#about", "/blog", "/promo", "/info#faq"]);
  });

  it("collapses the link columns on phones with «Контакти» open", async () => {
    mockFooterData();
    const user = userEvent.setup();

    render(await Footer());

    const catalogToggle = screen.getByRole("button", {
      name: dict.footer.catalogTitle,
    });
    expect(catalogToggle).toHaveAttribute("aria-expanded", "false");
    expect(columnPanel(dict.footer.catalogTitle)).toHaveClass("hidden");
    expect(
      screen.getByRole("button", { name: dict.footer.contactTitle }),
    ).toHaveAttribute("aria-expanded", "true");

    await user.click(catalogToggle);

    expect(catalogToggle).toHaveAttribute("aria-expanded", "true");
    expect(columnPanel(dict.footer.catalogTitle)).not.toHaveClass("hidden");
    // From md the panel shows regardless of the toggle.
    expect(columnPanel(dict.footer.catalogTitle)).toHaveClass("md:flex");
  });
});

describe("Footer — legal documents (TASK-184, TASK-2078)", () => {
  it("puts delivery/returns/warranty under «Покупцям» and the rest in the bottom legal row", async () => {
    mockFooterData({
      pages: [
        makePage({ slug: "delivery", title: "Доставка й оплата" }),
        makePage({ id: "p2", slug: "warranty", title: "Гарантія" }),
        makePage({ id: "p3", slug: "offer", title: "Публічна оферта" }),
        makePage({
          id: "p4",
          slug: "privacy-policy",
          title: "Політика конфіденційності",
        }),
      ],
    });

    render(await Footer());

    const buyers = columnPanel(dict.footer.buyersTitle);
    expect(
      within(buyers).getByRole("link", { name: "Доставка й оплата" }),
    ).toHaveAttribute("href", "/legal/delivery");
    expect(
      within(buyers).getByRole("link", { name: "Гарантія" }),
    ).toHaveAttribute("href", "/legal/warranty");

    const legal = screen.getByRole("list", { name: dict.footer.legalAria });
    expect(
      within(legal).getByRole("link", { name: "Публічна оферта" }),
    ).toHaveAttribute("href", "/legal/offer");
    expect(
      within(legal).getByRole("link", { name: "Політика конфіденційності" }),
    ).toHaveAttribute("href", "/legal/privacy-policy");
    expect(
      within(legal).queryByRole("link", { name: "Гарантія" }),
    ).not.toBeInTheDocument();
  });

  it("still renders About/FAQ/Blog and no /legal link when no pages are published", async () => {
    mockFooterData();

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
    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("href")?.startsWith("/legal")),
    ).toHaveLength(0);
    expect(
      screen.queryByRole("list", { name: dict.footer.legalAria }),
    ).not.toBeInTheDocument();
  });
});

describe("Footer — help pages and the two hubs (TASK-834)", () => {
  it("links every published help page at /info/<slug>, but not the ones /info inlines", async () => {
    mockFooterData({
      pages: [
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
      ],
    });

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
    // A buyer document alone still brings the hub link.
    mockFooterData({ pages: [makePage()] });

    render(await Footer());

    expect(
      screen.getByRole("link", { name: dict.footer.infoHelpHub }),
    ).toHaveAttribute("href", "/info");
    expect(
      screen.getByRole("link", { name: dict.footer.infoLegalHub }),
    ).toHaveAttribute("href", "/legal");
  });

  it("omits the /legal hub link when no legal document is published", async () => {
    mockFooterData();

    render(await Footer());

    expect(
      screen.queryByRole("link", { name: dict.footer.infoLegalHub }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.footer.infoHelpHub }),
    ).toHaveAttribute("href", "/info");
  });
});

describe("Footer — contacts", () => {
  it("links the single contact form from «Контакти» even with nothing configured (TASK-866)", async () => {
    mockFooterData();

    render(await Footer());

    const link = screen.getByRole("link", {
      name: dict.footer.contactFormLink,
    });
    expect(link).toHaveAttribute("href", "/contact");
    expect(columnPanel(dict.footer.contactTitle)).toContainElement(link);
    // The icon is decoration; the name is the visible text alone.
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(
      screen
        .getAllByRole("link")
        .filter((l) => l.getAttribute("href") === "/contact"),
    ).toHaveLength(1);
  });

  it("calls a free line free, and a city number not", async () => {
    mockFooterData({
      contact: { phone: "0 800 00 00 00", workingHours: "Пн–Нд 9:00–20:00" },
    });

    const { unmount } = render(await Footer());

    expect(
      screen.getByText(`${dict.footer.callsFree} · Пн–Нд 9:00–20:00`),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "0 800 00 00 00" }),
    ).toHaveAttribute("href", "tel:0800000000");
    unmount();

    // The fallback number is a +380 44 city line.
    mockFooterData();
    render(await Footer());
    expect(screen.queryByText(new RegExp(dict.footer.callsFree))).toBeNull();
  });

  it("renders only the socials that are set", async () => {
    mockFooterData({ contact: { telegramLink: "https://t.me/shop" } });

    render(await Footer());

    const socials = screen.getByRole("list", { name: dict.footer.socialsAria });
    expect(within(socials).getAllByRole("link")).toHaveLength(1);
    expect(
      within(socials).getByRole("link", { name: "Telegram" }),
    ).toHaveAttribute("href", "https://t.me/shop");
  });
});

describe("Footer — store logo (TASK-299)", () => {
  it("renders the typographic wordmark when no logo is uploaded", async () => {
    mockFooterData({ seo: { logoUrl: null } });

    render(await Footer());

    expect(screen.getByRole("link", { name: "CaseStore" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(document.querySelector("footer img")).not.toBeInTheDocument();
  });

  it("renders the uploaded logo (alt = brand name) inside the home link", async () => {
    const logoUrl = "http://localhost:3001/uploads/branding/logo.svg";
    mockFooterData({ seo: { logoUrl } });

    render(await Footer());

    const img = screen.getByRole("img", { name: "CaseStore" });
    expect(img).toHaveAttribute("src", logoUrl);
    expect(screen.getByRole("link", { name: "CaseStore" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});

describe("Footer — store name (TASK-546)", () => {
  it("prints the admin-managed name in the wordmark and the © line", async () => {
    mockFooterData({ seo: { logoUrl: null, siteName: "  Аксесуарня " } });

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
    mockFooterData({ seo: { logoUrl, siteName: "Аксесуарня" } });

    render(await Footer());

    expect(screen.getByRole("img", { name: "Аксесуарня" })).toHaveAttribute(
      "src",
      logoUrl,
    );
  });

  it("falls back to the default name in the © line when none is set", async () => {
    mockFooterData({ seo: { logoUrl: null, siteName: null } });

    render(await Footer());

    const year = new Date().getFullYear();
    expect(
      screen.getByText(dict.footer.rights(year, "CaseStore")),
    ).toBeInTheDocument();
  });
});
