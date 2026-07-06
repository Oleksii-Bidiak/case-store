import { http, HttpResponse, delay } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { SeoSettingsView } from "./seo-settings-view";

const SINGLETON_ID = "00000000-0000-0000-0000-000000000002";

function seoSettingsResponse() {
  return {
    data: {
      id: SINGLETON_ID,
      defaultMetaTitle: "MobileStore — аксесуари",
      defaultMetaDescription: "Магазин аксесуарів та Apple-техніки.",
      titleTemplate: "%s | MobileStore",
      defaultOgImage: null,
      noindexSite: false,
      llmsTxtSummary: null,
      additionalSameAsLinks: ["https://facebook.com/mobilestore"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

describe("SeoSettingsView (TASK-239)", () => {
  it("populates the form inputs from the fetched settings", async () => {
    server.use(
      http.get("*/api/seo-settings", () =>
        HttpResponse.json(seoSettingsResponse()),
      ),
    );

    renderWithProviders(<SeoSettingsView />);

    expect(
      await screen.findByDisplayValue("MobileStore — аксесуари"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("%s | MobileStore")).toBeInTheDocument();
    // The newline-joined sameAs textarea shows the single seeded link.
    expect(
      screen.getByDisplayValue("https://facebook.com/mobilestore"),
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
