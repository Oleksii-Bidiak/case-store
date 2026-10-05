import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict, STOREFRONT_HOST } from "@/shared/config";
import type { SeoSettingsEntity } from "@/entities/seo-settings";
import { SEO_SECTION_IDS, SeoSettingsForm } from "./seo-settings-form";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

/** Zero-config settings singleton (all defaults blank). */
function makeSettings(
  overrides: Partial<SeoSettingsEntity> = {},
): SeoSettingsEntity {
  return {
    id: "00000000-0000-0000-0000-000000000002",
    siteName: null,
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

// TASK-552: two samples — a page WITH a name (tier "derived", the defaults
// lose) and one WITHOUT (the only place the defaults surface). TASK-1053 (Н2)
// shows ONE preview at a time with a switch between the two samples, so each
// helper first switches to its sample (a no-op when it is already shown).
const showSample = (label: string) => {
  const toggle = screen.getByRole("button", { name: label });
  if (toggle.getAttribute("aria-pressed") !== "true") fireEvent.click(toggle);
};
const named = () => {
  showSample(dict.seoSettingsForm.previewNamedHeading);
  return within(screen.getByTestId("seo-preview-named"));
};
const unnamed = () => {
  showSample(dict.seoSettingsForm.previewUnnamedHeading);
  return within(screen.getByTestId("seo-preview-unnamed"));
};
const previewTitle = () => named().getByTestId("seo-snippet-title");
const previewHint = () => named().getByTestId("seo-snippet-hint");
const unnamedTitle = () => unnamed().getByTestId("seo-snippet-title");
const unnamedHint = () => unnamed().getByTestId("seo-snippet-hint");
const defaultDescriptionField = () =>
  screen.getByLabelText(dict.seoSettingsForm.defaultMetaDescription);
const defaultTitleField = () =>
  screen.getByLabelText(dict.seoSettingsForm.defaultMetaTitle);
const templateField = () =>
  screen.getByLabelText(dict.seoSettingsForm.titleTemplate);

describe("SeoSettingsForm — self-referential SERP preview (TASK-268)", () => {
  it("labels both sample pages", () => {
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);
    expect(
      named().getByText(
        dict.seoSettingsForm.previewNamedNote(
          dict.seoSnippetPreview.samplePageName,
        ),
      ),
    ).toBeInTheDocument();
    expect(
      unnamed().getByText(dict.seoSettingsForm.previewUnnamedNote),
    ).toBeInTheDocument();
  });

  it("shows ONE preview at a time, the named page first (TASK-1053)", async () => {
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    expect(screen.getByTestId("seo-preview-named")).toBeInTheDocument();
    expect(screen.queryByTestId("seo-preview-unnamed")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: dict.seoSettingsForm.previewNamedHeading,
      }),
    ).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.seoSettingsForm.previewUnnamedHeading,
      }),
    );

    expect(screen.getByTestId("seo-preview-unnamed")).toBeInTheDocument();
    expect(screen.queryByTestId("seo-preview-named")).not.toBeInTheDocument();
  });

  it("blank default title → previews the template applied to a sample page (derived)", () => {
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    expect(previewTitle()).toHaveTextContent(
      `${dict.seoSnippetPreview.samplePageName} | CaseStore`,
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

  // TASK-552 — the default used to be fed in as the sample page's OWN title,
  // so this preview claimed the default beats a product's name. Since TASK-432
  // the storefront does the opposite; the preview now says so.
  it("a filled default title does NOT replace a named page's title", async () => {
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    await userEvent.type(defaultTitleField(), "Мій магазин аксесуарів");

    await waitFor(() =>
      expect(unnamedTitle()).toHaveTextContent("Мій магазин аксесуарів"),
    );
    expect(previewTitle()).toHaveTextContent(
      `${dict.seoSnippetPreview.samplePageName} | CaseStore`,
    );
    expect(previewTitle()).not.toHaveTextContent("Мій магазин аксесуарів");
    expect(previewHint()).toHaveTextContent(dict.seoSnippetPreview.hintDerived);
  });

  it("shows the defaults verbatim on the page without content (tier «default»)", async () => {
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    await userEvent.type(defaultTitleField(), "Мій магазин аксесуарів");
    await userEvent.type(defaultDescriptionField(), "Опис магазину");

    await waitFor(() =>
      expect(unnamedTitle()).toHaveTextContent("Мій магазин аксесуарів"),
    );
    // Verbatim: the default is an absolute title, not run through the template.
    expect(unnamedTitle()).not.toHaveTextContent("| CaseStore");
    expect(unnamedHint()).toHaveTextContent(dict.seoSnippetPreview.hintDefault);
    expect(unnamed().getByTestId("seo-snippet-description")).toHaveTextContent(
      "Опис магазину",
    );
    // …and the named page keeps its own description.
    expect(named().getByTestId("seo-snippet-description")).toHaveTextContent(
      dict.seoSnippetPreview.samplePageDescription,
    );
  });

  it("says the page without content has nothing to show while the defaults are blank", () => {
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    expect(unnamedTitle()).toHaveTextContent(dict.seoSnippetPreview.emptyTitle);
    expect(unnamedHint()).toHaveTextContent(dict.seoSnippetPreview.hintEmpty);
  });

  // TASK-433 — the green breadcrumb line used to be the hardcoded string
  // "casestore.ua": somebody else's domain in the owner's own Google preview.
  // It now comes from the storefront origin in the environment, so the assertion
  // is against that resolved host — not against a literal copied from the output.
  it("shows the storefront host from the environment, not a hardcoded domain", () => {
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    for (const url of screen.getAllByTestId("seo-snippet-url")) {
      expect(url).toHaveTextContent(STOREFRONT_HOST);
      expect(url).not.toHaveTextContent("casestore.ua");
    }
  });
});

describe("SeoSettingsForm — store name (TASK-433)", () => {
  const f = dict.seoSettingsForm;
  const siteNameField = () => screen.getByLabelText(f.siteName);

  it("renders the store name as the FIRST field of the form", () => {
    const { container } = renderWithProviders(
      <SeoSettingsForm settings={makeSettings()} />,
    );

    // The name is what every title and template below is built from, so it leads.
    const labels = Array.from(container.querySelectorAll("label")).map(
      (l) => l.textContent,
    );
    expect(labels[0]).toBe(f.siteName);
  });

  it("seeds the input from the stored name", () => {
    renderWithProviders(
      <SeoSettingsForm settings={makeSettings({ siteName: "Аксесуарня" })} />,
    );

    expect(siteNameField()).toHaveValue("Аксесуарня");
  });

  it("says out loud that the logo lettering is still changed in code", () => {
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    expect(screen.getByText(f.siteNameLogoNote)).toBeInTheDocument();
  });

  it("submits the typed name to the API", async () => {
    const bodies = stubUpdate();
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    await userEvent.type(siteNameField(), "Аксесуарня");
    await userEvent.click(screen.getByRole("button", { name: f.submit }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ siteName: "Аксесуарня" });
  });

  it("re-brands the SERP preview live as the name is typed", async () => {
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    await userEvent.type(siteNameField(), "Аксесуарня");

    await waitFor(() =>
      expect(previewTitle()).toHaveTextContent(
        `${dict.seoSnippetPreview.samplePageName} | Аксесуарня`,
      ),
    );
  });

  it("drops a blank name so the backend keeps the previous value", async () => {
    const bodies = stubUpdate();
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    await userEvent.click(screen.getByRole("button", { name: f.submit }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toHaveProperty("siteName");
  });
});

/** Unfold a collapsed section (TASK-1053) — a no-op when it is open. */
const expand = (title: string) => {
  const region = screen.getByRole("region", { name: title });
  const toggle = within(region).queryByRole("button", {
    name: dict.canon.expand,
  });
  if (toggle) fireEvent.click(toggle);
};

describe("SeoSettingsForm — search-console verification fields (TASK-280)", () => {
  const f = dict.seoSettingsForm;
  const googleField = () => {
    expand(f.sectionVerification);
    return screen.getByLabelText(f.googleSiteVerification);
  };
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

describe("SeoSettingsForm — by mockup Н2/Н5 (TASK-1053)", () => {
  const f = dict.seoSettingsForm;

  it("splits the form into the anchored sections the nav points at", () => {
    renderWithProviders(
      <SeoSettingsForm settings={makeSettings()} logoSlot={<p>logo-slot</p>} />,
    );

    const ids = {
      [f.sectionStore]: SEO_SECTION_IDS.store,
      [f.sectionDefaults]: SEO_SECTION_IDS.defaults,
      [f.sectionSocial]: SEO_SECTION_IDS.social,
      [f.sectionVerification]: SEO_SECTION_IDS.verification,
      [f.sectionAi]: SEO_SECTION_IDS.ai,
    };
    for (const [title, id] of Object.entries(ids)) {
      expect(screen.getByRole("region", { name: title })).toHaveAttribute(
        "id",
        id,
      );
    }
    // The logo upload sits in «Магазин і логотип», beside the store name.
    expect(
      within(screen.getByRole("region", { name: f.sectionStore })).getByText(
        "logo-slot",
      ),
    ).toBeInTheDocument();
  });

  it("warns about an empty default title — a recommendation, not a blocker (TASK-1175)", async () => {
    const bodies = stubUpdate();
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    expect(screen.getByText(f.emptyTitleWarning)).toBeInTheDocument();
    expect(defaultTitleField()).toHaveAttribute("aria-invalid", "true");
    expect(defaultTitleField()).toHaveAccessibleDescription(
      expect.stringContaining(f.emptyTitleRecommendation),
    );

    // Saving is still allowed.
    await userEvent.click(screen.getByRole("button", { name: f.submit }));
    await waitFor(() => expect(bodies).toHaveLength(1));
  });

  it("drops the warning once a default title is typed", async () => {
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    await userEvent.type(defaultTitleField(), "Мій магазин аксесуарів");

    expect(screen.queryByText(f.emptyTitleWarning)).not.toBeInTheDocument();
    expect(defaultTitleField()).not.toHaveAttribute("aria-invalid");
  });

  it("folds social, verification and AI to one-line summaries", async () => {
    renderWithProviders(
      <SeoSettingsForm
        settings={makeSettings({
          defaultOgImage: "https://shop.ua/og.jpg",
          googleSiteVerification: "G-1",
        })}
      />,
    );

    expect(screen.queryByLabelText(f.defaultOgImage)).not.toBeInTheDocument();
    expect(screen.getByText(f.summaryOgSet)).toBeInTheDocument();
    expect(screen.getByText(f.summaryGoogleSet)).toBeInTheDocument();
    expect(screen.getByText(f.summaryBingUnset)).toBeInTheDocument();
    expect(screen.getByText(f.summaryLlmsDefault)).toBeInTheDocument();

    expand(f.sectionSocial);
    expect(screen.getByLabelText(f.defaultOgImage)).toHaveValue(
      "https://shop.ua/og.jpg",
    );
  });

  it("keeps folded values in the save", async () => {
    const bodies = stubUpdate();
    renderWithProviders(
      <SeoSettingsForm
        settings={makeSettings({ llmsTxtSummary: "Про нас" })}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: f.submit }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ llmsTxtSummary: "Про нас" });
  });

  it("unfolds a section whose field has an error, so the error is seen", async () => {
    const bodies = stubUpdate();
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    expand(f.sectionSocial);
    await userEvent.type(screen.getByLabelText(f.defaultOgImage), "not a url");
    await userEvent.click(
      within(screen.getByRole("region", { name: f.sectionSocial })).getByRole(
        "button",
        { name: dict.canon.collapse },
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: f.submit }));

    expect(await screen.findByText(f.errors.urlInvalid)).toBeInTheDocument();
    expect(screen.getByLabelText(f.defaultOgImage)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("lists the edited sections in the sticky bar and discards them", async () => {
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    await userEvent.type(defaultTitleField(), "Мій магазин");

    expect(
      screen.getByText(dict.canon.unsavedChanges(f.sectionDefaults)),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: dict.canon.discardChanges }),
    );

    expect(defaultTitleField()).toHaveValue("");
    expect(screen.queryByText(/Незбережені зміни/)).not.toBeInTheDocument();
  });

  it("is clean again after a successful save", async () => {
    const bodies = stubUpdate();
    renderWithProviders(<SeoSettingsForm settings={makeSettings()} />);

    await userEvent.type(defaultTitleField(), "Мій магазин");
    await userEvent.click(screen.getByRole("button", { name: f.submit }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() =>
      expect(screen.queryByText(/Незбережені зміни/)).not.toBeInTheDocument(),
    );
    expect(defaultTitleField()).toHaveValue("Мій магазин");
  });
});
