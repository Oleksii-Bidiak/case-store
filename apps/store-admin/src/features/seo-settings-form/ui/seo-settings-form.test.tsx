import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { SeoSettingsEntity } from "@/entities/seo-settings";
import { SeoSettingsForm } from "./seo-settings-form";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

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
    googleSiteVerification: null,
    bingSiteVerification: null,
    noindexSite: false,
    llmsTxtSummary: null,
    additionalSameAsLinks: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Stub PUT /api/admin/seo-settings and collect submitted bodies. */
function stubUpdate() {
  const bodies: unknown[] = [];
  server.use(
    http.put("*/api/admin/seo-settings", async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ data: makeSettings() });
    }),
  );
  return bodies;
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

describe("SeoSettingsForm — search-console verification fields (TASK-280)", () => {
  const f = dict.seoSettingsForm;
  const googleField = () => screen.getByLabelText(f.googleSiteVerification);
  const submit = () =>
    userEvent.click(screen.getByRole("button", { name: f.submit }));

  it("sends a typed bare token verbatim on submit", async () => {
    const bodies = stubUpdate();
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    await userEvent.type(googleField(), "G-TOKEN-123");
    await submit();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ googleSiteVerification: "G-TOKEN-123" });
  });

  it("normalizes a pasted full <meta> tag to the token on blur (visible in the input)", async () => {
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    await userEvent.click(googleField());
    await userEvent.paste(
      '<meta name="google-site-verification" content="XYZ" />',
    );
    await userEvent.tab();

    await waitFor(() => expect(googleField()).toHaveValue("XYZ"));
  });

  it("omits both verification fields from the payload when left blank", async () => {
    const bodies = stubUpdate();
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    await submit();

    await waitFor(() => expect(bodies).toHaveLength(1));
    const body = bodies[0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("googleSiteVerification");
    expect(body).not.toHaveProperty("bingSiteVerification");
  });
});
