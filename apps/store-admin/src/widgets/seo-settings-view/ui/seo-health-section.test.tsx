import { http, HttpResponse, delay } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { STOREFRONT_URL } from "@/shared/config";
import type { SeoSettingsEntity } from "@/entities/seo-settings";
import { SeoHealthSection } from "./seo-health-section";

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

    expect(await screen.findByText(h.autoHint(12, 40))).toBeInTheDocument();
    expect(screen.getByText(h.autoHint(3, 8))).toBeInTheDocument();
    expect(screen.getByText(h.autoHint(1, 5))).toBeInTheDocument();
    // Informational, never an error — no destructive styling on these rows.
    expect(screen.getByText(h.autoHint(12, 40))).not.toHaveClass(
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

describe("SeoHealthSection — defaults-filled nudge (TASK-269)", () => {
  it("renders the neutral 'filled' state when both defaults are set", async () => {
    stubHealth();
    renderWithProviders(
      <SeoHealthSection
        settings={makeSettings({
          defaultMetaTitle: "MobileStore",
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
        settings={makeSettings({ defaultMetaTitle: "MobileStore" })}
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
