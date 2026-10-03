import { http, HttpResponse, delay } from "msw";
import { renderWithProviders, screen, within } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { STOREFRONT_URL } from "@/shared/config";
import type { SeoSettingsEntity } from "@/entities/seo-settings";
import { SEO_HEALTH_SECTION_ID, SeoHealthSection } from "./seo-health-section";

const h = dict.seoHealth;

function makeSettings(
  overrides: Partial<SeoSettingsEntity> = {},
): SeoSettingsEntity {
  return {
    id: "00000000-0000-0000-0000-000000000002",
    defaultMetaTitle: null,
    defaultMetaDescription: null,
    titleTemplate: null,
    defaultOgImage: null,
    noindexSite: false,
    llmsTxtSummary: null,
    additionalSameAsLinks: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const HEALTH = {
  productsMissingMetaTitle: 12,
  productsTotal: 40,
  categoriesMissingMetaTitle: 3,
  categoriesTotal: 8,
  pagesMissingMetaTitle: 1,
  pagesTotal: 5,
  // TASK-285: page content-gap counters.
  pagesMissingMetaDescription: 2,
  pagesThinContent: 4,
};

function stubHealth(body = HEALTH) {
  server.use(
    http.get("*/api/admin/seo-settings/health", () =>
      HttpResponse.json({ data: body }),
    ),
  );
}

describe("SeoHealthSection — auto-title counts (TASK-269)", () => {
  it("renders the three auto-title rows with their N із M numbers", async () => {
    stubHealth();
    renderWithProviders(<SeoHealthSection settings={makeSettings()} />);

    expect(await screen.findByText(h.gapHint(12, 40))).toBeInTheDocument();
    expect(screen.getByText(h.gapHint(3, 8))).toBeInTheDocument();
    expect(screen.getByText(h.gapHint(1, 5))).toBeInTheDocument();
    // Informational, never an error — no destructive styling on these rows.
    expect(screen.getByText(h.gapHint(12, 40))).not.toHaveClass(
      "text-destructive",
    );
  });

  it("shows a skeleton while loading, then the error copy on failure", async () => {
    server.use(
      http.get("*/api/admin/seo-settings/health", async () => {
        await delay(20);
        return HttpResponse.json({ message: "boom" }, { status: 500 });
      }),
    );
    renderWithProviders(<SeoHealthSection settings={makeSettings()} />);

    expect(await screen.findByText(h.loadError)).toBeInTheDocument();
  });
});

describe("SeoHealthSection — page content-gap rows (TASK-285)", () => {
  it("renders the missing-description and thin-content rows with N із M numbers", async () => {
    stubHealth();
    renderWithProviders(<SeoHealthSection settings={makeSettings()} />);

    expect(
      await screen.findByText(h.pagesMissingDescriptionLabel),
    ).toBeInTheDocument();
    expect(screen.getByText(h.pagesThinContentLabel)).toBeInTheDocument();
    // pagesMissingMetaDescription (2) / pagesThinContent (4) over pagesTotal (5).
    expect(screen.getByText(h.gapHint(2, 5))).toBeInTheDocument();
    expect(screen.getByText(h.gapHint(4, 5))).toBeInTheDocument();
    // Same /pages link target, neutral tone (no destructive styling).
    expect(
      screen.getByRole("link", { name: h.pagesMissingDescriptionLabel }),
    ).toHaveAttribute("href", "/pages");
    expect(
      screen.getByRole("link", { name: h.pagesThinContentLabel }),
    ).toHaveAttribute("href", "/pages");
    expect(screen.getByText(h.gapHint(2, 5))).not.toHaveClass(
      "text-destructive",
    );
  });

  it("hides the gap rows while the health query is failing (error copy instead)", async () => {
    server.use(
      http.get("*/api/admin/seo-settings/health", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderWithProviders(<SeoHealthSection settings={makeSettings()} />);

    expect(await screen.findByText(h.loadError)).toBeInTheDocument();
    expect(
      screen.queryByText(h.pagesMissingDescriptionLabel),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(h.pagesThinContentLabel)).not.toBeInTheDocument();
  });
});

describe("SeoHealthSection — defaults-filled nudge (TASK-269)", () => {
  it("renders the neutral 'filled' state when both defaults are set", async () => {
    stubHealth();
    renderWithProviders(
      <SeoHealthSection
        settings={makeSettings({
          defaultMetaTitle: "CaseStore",
          defaultMetaDescription: "Магазин аксесуарів",
        })}
      />,
    );

    expect(await screen.findByText(h.defaultsFilledYes)).toBeInTheDocument();
    expect(screen.queryByText(h.defaultsFilledNo)).not.toBeInTheDocument();
  });

  it("renders the amber nudge when a default is empty", async () => {
    stubHealth();
    renderWithProviders(
      <SeoHealthSection
        settings={makeSettings({ defaultMetaTitle: "CaseStore" })}
      />,
    );

    const nudge = await screen.findByText(h.defaultsFilledNo);
    expect(nudge).toBeInTheDocument();
    expect(nudge).toHaveClass("text-warning");
  });
});

describe("SeoHealthSection — noindex banner (TASK-269)", () => {
  it("renders the RED warning banner when noindexSite is true", async () => {
    stubHealth();
    renderWithProviders(
      <SeoHealthSection settings={makeSettings({ noindexSite: true })} />,
    );

    expect(await screen.findByText(h.noindexWarningTitle)).toBeInTheDocument();
    expect(screen.getByText(h.noindexWarningTitle)).toHaveClass(
      "text-destructive",
    );
    expect(screen.queryByText(h.noindexOkLabel)).not.toBeInTheDocument();
  });

  // TASK-718: the toggle the old advice pointed at was removed (TASK-307) —
  // the banner must not send the operator to a control that does not exist.
  it("tells the operator to call the developer, not to flip a removed toggle", async () => {
    stubHealth();
    renderWithProviders(
      <SeoHealthSection settings={makeSettings({ noindexSite: true })} />,
    );

    const body = await screen.findByText(h.noindexWarningBody);
    expect(body).toHaveTextContent(/зверніться до розробника/);
    expect(body).toHaveTextContent(/у базі даних/);
    expect(body).not.toHaveTextContent(/Приховати сайт/);
  });

  it("renders the neutral visible line when noindexSite is false", async () => {
    stubHealth();
    renderWithProviders(
      <SeoHealthSection settings={makeSettings({ noindexSite: false })} />,
    );

    expect(await screen.findByText(h.noindexOkLabel)).toBeInTheDocument();
    expect(screen.queryByText(h.noindexWarningTitle)).not.toBeInTheDocument();
  });
});

describe("SeoHealthSection — outbound links (TASK-269)", () => {
  it("links robots/sitemap/llms at the storefront origin, new tab", async () => {
    stubHealth();
    renderWithProviders(<SeoHealthSection settings={makeSettings()} />);

    const robots = await screen.findByRole("link", {
      name: h.openLinkAria(h.robotsLink),
    });
    const sitemap = screen.getByRole("link", {
      name: h.openLinkAria(h.sitemapLink),
    });
    const llms = screen.getByRole("link", { name: h.openLinkAria(h.llmsLink) });

    expect(robots).toHaveAttribute("href", `${STOREFRONT_URL}/robots.txt`);
    expect(sitemap).toHaveAttribute("href", `${STOREFRONT_URL}/sitemap.xml`);
    expect(llms).toHaveAttribute("href", `${STOREFRONT_URL}/llms.txt`);
    expect(robots).toHaveAttribute("target", "_blank");
    expect(robots).toHaveAttribute("rel", "noopener noreferrer");
  });
});

/**
 * TASK-1053 (Н2): «Стан SEO» is a card of rows — a status dot, the label, the
 * number — with the visibility badge in its header. The section lists still
 * open from the labels (unfiltered: none of them can filter by an SEO gap yet,
 * so there is no «Показати →» promising one).
 */
describe("SeoHealthSection — by mockup Н2 (TASK-1053)", () => {
  it("is a section titled «Стан SEO» with the visibility badge", async () => {
    stubHealth();
    renderWithProviders(<SeoHealthSection settings={makeSettings()} />);

    const section = screen.getByRole("region", { name: h.heading });
    expect(section).toHaveAttribute("id", SEO_HEALTH_SECTION_ID);
    expect(
      await within(section).findByText(h.noindexOkLabel),
    ).toBeInTheDocument();
  });

  it("keeps every row's link to its list", async () => {
    stubHealth();
    renderWithProviders(<SeoHealthSection settings={makeSettings()} />);

    expect(
      await screen.findByRole("link", { name: h.productsAutoLabel }),
    ).toHaveAttribute("href", "/products");
    expect(
      screen.getByRole("link", { name: h.categoriesAutoLabel }),
    ).toHaveAttribute("href", "/categories");
    expect(
      screen.getByRole("link", { name: h.pagesAutoLabel }),
    ).toHaveAttribute("href", "/pages");
    expect(screen.queryByText(/Показати/)).not.toBeInTheDocument();
  });

  it("tones a non-zero gap amber and offers «Заповнити» to the empty defaults", async () => {
    stubHealth();
    renderWithProviders(<SeoHealthSection settings={makeSettings()} />);

    expect(await screen.findByText(h.gapHint(2, 5))).toHaveClass(
      "text-warning",
    );
    expect(screen.getByRole("link", { name: h.fillDefaults })).toHaveAttribute(
      "href",
      "#seo-default-title",
    );
  });

  it("has no «Заповнити» once the defaults are filled", async () => {
    stubHealth();
    renderWithProviders(
      <SeoHealthSection
        settings={makeSettings({
          defaultMetaTitle: "CaseStore",
          defaultMetaDescription: "Магазин аксесуарів",
        })}
      />,
    );

    await screen.findByText(h.defaultsFilledYes);
    expect(
      screen.queryByRole("link", { name: h.fillDefaults }),
    ).not.toBeInTheDocument();
  });

  it("shows the defaults row even while the counts fail", async () => {
    server.use(
      http.get("*/api/admin/seo-settings/health", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderWithProviders(<SeoHealthSection settings={makeSettings()} />);

    expect(await screen.findByText(h.loadError)).toBeInTheDocument();
    expect(screen.getByText(h.defaultsFilledNo)).toBeInTheDocument();
  });
});
