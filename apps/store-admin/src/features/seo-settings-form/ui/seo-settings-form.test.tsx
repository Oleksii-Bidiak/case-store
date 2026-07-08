import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { SeoSettingsEntity } from "@/entities/seo-settings";
import { SeoSettingsForm } from "./seo-settings-form";

/** Zero-config settings singleton (all defaults blank). */
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

const previewTitle = () => screen.getByTestId("seo-snippet-title");
const previewHint = () => screen.getByTestId("seo-snippet-hint");
const defaultTitleField = () =>
  screen.getByLabelText(dict.seoSettingsForm.defaultMetaTitle);
const templateField = () =>
  screen.getByLabelText(dict.seoSettingsForm.titleTemplate);

describe("SeoSettingsForm — self-referential SERP preview (TASK-268)", () => {
  it("shows the sample-page note", () => {
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);
    expect(
      screen.getByText(dict.seoSnippetPreview.sampleNote),
    ).toBeInTheDocument();
  });

  it("blank default title → previews the template applied to a sample page (derived)", () => {
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    expect(previewTitle()).toHaveTextContent(
      `${dict.seoSnippetPreview.samplePageName} | MobileStore`,
    );
    expect(previewHint()).toHaveTextContent(dict.seoSnippetPreview.hintDerived);
  });

  it("live-updates the sample title as the template is typed (while default title is blank)", async () => {
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    await userEvent.clear(templateField());
    await userEvent.type(templateField(), "%s — Крамниця");

    await waitFor(() =>
      expect(previewTitle()).toHaveTextContent(
        `${dict.seoSnippetPreview.samplePageName} — Крамниця`,
      ),
    );
  });

  it("filling the default title switches the preview to that value verbatim (own)", async () => {
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    await userEvent.type(defaultTitleField(), "Мій магазин аксесуарів");

    await waitFor(() =>
      expect(previewTitle()).toHaveTextContent("Мій магазин аксесуарів"),
    );
    expect(previewTitle()).not.toHaveTextContent("| MobileStore");
    expect(previewHint()).toHaveTextContent(dict.seoSnippetPreview.hintOwn);
  });
});
