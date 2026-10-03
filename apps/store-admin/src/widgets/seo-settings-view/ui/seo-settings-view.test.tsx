import { http, HttpResponse, delay } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { SeoSettingsView } from "./seo-settings-view";

const SINGLETON_ID = "00000000-0000-0000-0000-000000000002";

function seoSettingsResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: SINGLETON_ID,
      defaultMetaTitle: "CaseStore — аксесуари",
      defaultMetaDescription: "Магазин аксесуарів та Apple-техніки.",
      titleTemplate: "%s | CaseStore",
      defaultOgImage: null,
      noindexSite: false,
      llmsTxtSummary: null,
      additionalSameAsLinks: ["https://facebook.com/casestore"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    },
  };
}

function stubHealth() {
  server.use(
    http.get("*/api/admin/seo-settings/health", () =>
      HttpResponse.json({
        data: {
          productsMissingMetaTitle: 0,
          productsTotal: 4,
          categoriesMissingMetaTitle: 0,
          categoriesTotal: 2,
          pagesMissingMetaTitle: 0,
          pagesTotal: 1,
          pagesMissingMetaDescription: 0,
          pagesThinContent: 0,
        },
      }),
    ),
  );
}

describe("SeoSettingsView (TASK-239)", () => {
  it("populates the form inputs from the fetched settings", async () => {
    stubHealth();
    server.use(
      http.get("*/api/seo-settings", () =>
        HttpResponse.json(seoSettingsResponse()),
      ),
    );

    renderWithProviders(<SeoSettingsView />);

    expect(
      await screen.findByDisplayValue("CaseStore — аксесуари"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("%s | CaseStore")).toBeInTheDocument();
    // The sameAs textarea lives in the folded «Соцмережі» (TASK-1053).
    await userEvent.click(
      within(
        screen.getByRole("region", {
          name: dict.seoSettingsForm.sectionSocial,
        }),
      ).getByRole("button", { name: dict.canon.expand }),
    );
    expect(
      screen.getByDisplayValue("https://facebook.com/casestore"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.seoSettingsForm.submit }),
    ).toBeInTheDocument();
  });

  it("shows the loading state while the query is pending", () => {
    server.use(
      http.get("*/api/seo-settings", async () => {
        await delay("infinite");
        return HttpResponse.json(seoSettingsResponse());
      }),
    );

    renderWithProviders(<SeoSettingsView />);

    expect(screen.getByText(dict.seoSettings.heading)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.seoSettingsForm.submit }),
    ).not.toBeInTheDocument();
  });
});

describe("SeoSettingsView — by mockup Н2 (TASK-1053)", () => {
  const f = dict.seoSettingsForm;

  it("is titled «SEO» with a section nav whose links point at the sections", async () => {
    stubHealth();
    server.use(
      http.get("*/api/seo-settings", () =>
        HttpResponse.json(seoSettingsResponse()),
      ),
    );

    renderWithProviders(<SeoSettingsView />);

    expect(
      screen.getByRole("heading", { level: 2, name: "SEO" }),
    ).toBeInTheDocument();
    const nav = await screen.findByRole("navigation", {
      name: dict.seoSettings.navAria,
    });
    const targets = within(nav)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(targets).toEqual([
      "#seo-health",
      "#seo-store",
      "#seo-defaults",
      "#seo-social",
      "#seo-verification",
      "#seo-ai",
    ]);
    // Every target exists on the page.
    for (const target of targets) {
      expect(document.getElementById((target ?? "").slice(1))).not.toBeNull();
    }
  });

  it("marks «За замовчуванням» as needing attention while the default title is empty", async () => {
    stubHealth();
    server.use(
      http.get("*/api/seo-settings", () =>
        HttpResponse.json(seoSettingsResponse({ defaultMetaTitle: null })),
      ),
    );

    renderWithProviders(<SeoSettingsView />);

    const nav = await screen.findByRole("navigation", {
      name: dict.seoSettings.navAria,
    });
    expect(
      within(nav).getByRole("link", {
        name: `${dict.seoSettings.navNeedsAttention} ${f.sectionDefaults}`,
      }),
    ).toBeInTheDocument();
  });

  it("keeps the logo upload, in «Магазин і логотип»", async () => {
    stubHealth();
    server.use(
      http.get("*/api/seo-settings", () =>
        HttpResponse.json(seoSettingsResponse()),
      ),
    );

    renderWithProviders(<SeoSettingsView />);

    const store = await screen.findByRole("region", { name: f.sectionStore });
    expect(
      within(store).getByRole("button", { name: dict.storeLogo.upload }),
    ).toBeInTheDocument();
  });

  it("offers «Повторити» when the settings fail to load", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/seo-settings", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ message: "boom" }, { status: 500 })
          : HttpResponse.json(seoSettingsResponse());
      }),
    );
    stubHealth();

    renderWithProviders(<SeoSettingsView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      dict.seoSettings.loadError,
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.canon.retry }),
    );
    expect(
      await screen.findByDisplayValue("CaseStore — аксесуари"),
    ).toBeInTheDocument();
  });
});
