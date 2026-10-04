import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { http, HttpResponse } from "msw";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { MAX_PAGE_CONTENT_LENGTH } from "../model/page-schema";
import { PageForm } from "./page-form";

// The rich-text body editor (Tiptap) touches the DOM on init; stub it so these
// tests stay deterministic. Resolves to the same module the `@/shared/ui`
// barrel re-exports. Since TASK-266 the stub is a lightweight controlled
// <textarea> proxy (value/onChange passthrough) instead of `() => null`, so the
// preview-tab tests below can drive the `content` field with userEvent.type.
jest.mock("@/shared/ui/rich-text-editor", () => ({
  __esModule: true,
  RichTextEditor: ({
    value,
    onChange,
    placeholder,
    disabled,
  }: {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <textarea
      data-testid="rte-stub"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  ),
}));

const f = dict.pageForm;
const noop = () => {};

const previewTitle = () => screen.getByTestId("seo-snippet-title");
const previewHint = () => screen.getByTestId("seo-snippet-hint");
const titleCounter = () => screen.getByTestId("seo-snippet-title-counter");
const metaTitleField = () => screen.getByLabelText(f.metaTitle);
const titleField = () => screen.getByRole("textbox", { name: f.title });
const kindField = () => screen.getByRole("combobox", { name: f.kind });
const previewUrl = () => screen.getByTestId("seo-snippet-url");
const submitButton = () => screen.getByRole("button", { name: f.submit });

/** Radix Select: open the trigger, pick the option by its visible name. */
async function pick(trigger: HTMLElement, option: string) {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

const pickKind = (label: string) => pick(kindField(), label);
// uk-UA groups thousands with a no-break space; the DOM matcher normalises the
// page's whitespace but not the expected string, so the helper does it here.
const nf = (value: number) => value.toLocaleString("uk-UA").replace(/\s/g, " ");

describe("PageForm — SERP snippet preview (TASK-268)", () => {
  it("derives the branded title from the page title when meta is blank", async () => {
    renderWithProviders(
      <PageForm
        id="page-1"
        defaultValues={{ title: "Доставка та оплата", content: "<p>x</p>" }}
        onSubmit={noop}
        isPending={false}
      />,
    );

    await waitFor(() =>
      expect(previewTitle()).toHaveTextContent(
        "Доставка та оплата | CaseStore",
      ),
    );
    expect(previewHint()).toHaveTextContent(dict.seoSnippetPreview.hintDerived);
  });

  it("live-updates the preview to the typed meta title and counter", async () => {
    renderWithProviders(
      <PageForm
        id="page-1"
        defaultValues={{ title: "Доставка та оплата", content: "<p>x</p>" }}
        onSubmit={noop}
        isPending={false}
      />,
    );

    await userEvent.type(metaTitleField(), "Доставка");

    await waitFor(() => expect(previewTitle()).toHaveTextContent("Доставка"));
    expect(previewTitle()).not.toHaveTextContent("| CaseStore");
    expect(previewHint()).toHaveTextContent(dict.seoSnippetPreview.hintOwn);
    expect(titleCounter()).toHaveTextContent("8/60");
  });

  it("shows the empty-tier hint before any title is entered", () => {
    renderWithProviders(<PageForm onSubmit={noop} isPending={false} />);

    expect(previewHint()).toHaveTextContent(dict.seoSnippetPreview.hintEmpty);
    expect(previewTitle()).toHaveTextContent(dict.seoSnippetPreview.emptyTitle);
  });
});

describe("PageForm — content preview tab (TASK-266)", () => {
  it("renders typed content in the «Перегляд» tab through RichTextPreview", async () => {
    renderWithProviders(<PageForm onSubmit={noop} isPending={false} />);

    await userEvent.type(
      screen.getByTestId("rte-stub"),
      "<h2>Доставка</h2><p>Нова Пошта.</p>",
    );

    await userEvent.click(
      screen.getByRole("tab", { name: dict.contentPreview.tabPreview }),
    );

    const preview = screen.getByTestId("rich-text-preview");
    expect(
      screen.getByRole("heading", { level: 2, name: "Доставка" }),
    ).toBeInTheDocument();
    expect(preview).toHaveTextContent("Нова Пошта.");
    expect(screen.queryByTestId("rte-stub")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("tab", { name: dict.contentPreview.tabEdit }),
    );
    expect(screen.getByTestId("rte-stub")).toHaveValue(
      "<h2>Доставка</h2><p>Нова Пошта.</p>",
    );
  });

  it("shows the empty placeholder in the preview tab before typing", async () => {
    renderWithProviders(<PageForm onSubmit={noop} isPending={false} />);

    await userEvent.click(
      screen.getByRole("tab", { name: dict.contentPreview.tabPreview }),
    );

    expect(screen.getByTestId("rich-text-preview")).toHaveTextContent(
      dict.contentPreview.emptyContent,
    );
  });
});

// TASK-435 — the form decides WHAT a row is, and the kind decides where it
// lives. Two things must not be possible: a hub with an invented address, and a
// SERP preview that shows an address the page will not actually have.
describe("PageForm — page kind (TASK-435)", () => {
  it("defaults to a legal page, and previews it under /legal", async () => {
    renderWithProviders(
      <PageForm
        id="page-1"
        defaultValues={{ title: "Оферта", slug: "offer", content: "<p>x</p>" }}
        onSubmit={noop}
        isPending={false}
      />,
    );

    await waitFor(() => expect(kindField()).toHaveTextContent(f.kindLegal));
    expect(previewUrl()).toHaveTextContent("legal › offer");
  });

  it("moves the address prefix and the preview to /info for a help page", async () => {
    renderWithProviders(
      <PageForm
        id="page-1"
        defaultValues={{ title: "Про нас", slug: "o-nas", content: "<p>x</p>" }}
        onSubmit={noop}
        isPending={false}
      />,
    );
    await waitFor(() =>
      expect(previewUrl()).toHaveTextContent("legal › o-nas"),
    );
    expect(screen.getByText("/legal/")).toBeInTheDocument();

    await pickKind(f.kindInfo);

    await waitFor(() => expect(previewUrl()).toHaveTextContent("info › o-nas"));
    expect(previewUrl()).not.toHaveTextContent("legal");
    expect(screen.getByText("/info/")).toBeInTheDocument();
  });

  it("replaces the free-text address with a picker of real sections for a hub", async () => {
    renderWithProviders(<PageForm onSubmit={noop} isPending={false} />);

    expect(screen.getByLabelText(f.address)).toBeInTheDocument();

    await pickKind(f.kindHub);

    // The free-text field is gone — a hub address cannot be typed.
    expect(screen.queryByLabelText(f.address)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("combobox", { name: f.hubSlug }));
    expect(
      await screen.findByRole("option", { name: "/blog" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "/categories" }),
    ).toBeInTheDocument();
  });

  it("previews a hub at the section's own route, with no slug segment after it", async () => {
    renderWithProviders(<PageForm onSubmit={noop} isPending={false} />);

    await pickKind(f.kindHub);
    await pick(screen.getByRole("combobox", { name: f.hubSlug }), "/blog");

    await waitFor(() => expect(previewUrl()).toHaveTextContent("› blog"));
    expect(previewUrl()).not.toHaveTextContent("legal");
    expect(previewUrl()).not.toHaveTextContent("info");
  });

  it("refuses to submit a hub with no section chosen", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<PageForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(screen.getByTestId("rte-stub"), "<p>Текст</p>");
    await userEvent.type(titleField(), "Хаб");
    await pickKind(f.kindHub);
    await userEvent.click(submitButton());

    expect(
      await screen.findByText(f.errors.hubSlugRequired),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the chosen kind and hub slug", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<PageForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(screen.getByTestId("rte-stub"), "<p>Текст</p>");
    await userEvent.type(titleField(), "Розділ «Блог»");
    await pickKind(f.kindHub);
    await pick(screen.getByRole("combobox", { name: f.hubSlug }), "/blog");
    await userEvent.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      kind: "HUB",
      slug: "blog",
    });
  });

  it("tells the operator a hub body is never shown on the site", async () => {
    renderWithProviders(<PageForm onSubmit={noop} isPending={false} />);

    expect(screen.queryByText(f.hubContentHint)).not.toBeInTheDocument();

    await pickKind(f.kindHub);

    expect(screen.getByText(f.hubContentHint)).toBeInTheDocument();
  });

  // TASK-437 + TASK-1117 — the tag field stays, but its hint no longer
  // promises search: nothing reads a page's tags yet.
  it("renders the tag and OG fields with an honest tag hint", () => {
    renderWithProviders(<PageForm onSubmit={noop} isPending={false} />);

    expect(screen.getByLabelText(f.keywords)).toBeInTheDocument();
    expect(screen.getByLabelText(dict.seoFields.ogImage)).toBeInTheDocument();
    expect(screen.getByText(f.keywordsHint)).toBeInTheDocument();
    expect(
      screen.queryByText(dict.seoFields.keywordsHint),
    ).not.toBeInTheDocument();
  });
});

/** Wave 198 — PagesProposal СР8–СР11. */
describe("PageForm — sections, one sticky save, errors under fields", () => {
  it("indexes the four sections and saves through ONE button", () => {
    renderWithProviders(<PageForm onSubmit={noop} isPending={false} />);

    const nav = screen.getByRole("navigation", { name: f.sectionsAria });
    for (const label of [
      f.sectionMain,
      f.sectionContent,
      f.sectionSeo,
      f.sectionPublish,
    ]) {
      expect(
        within(nav).getByRole("link", { name: label }),
      ).toBeInTheDocument();
    }
    expect(screen.getAllByRole("button", { name: f.submit })).toHaveLength(1);
  });

  it("names the failed fields above the form and under each field, with aria-invalid", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<PageForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.click(submitButton());

    const alert = await screen.findByText(
      dict.pages.formErrorsAlert(2, `«${f.title}» і «${f.content}»`),
    );
    expect(alert).toBeInTheDocument();
    expect(titleField()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(f.errors.titleRequired)).toBeInTheDocument();
    expect(screen.getByText(f.errors.contentRequired)).toBeInTheDocument();
    expect(screen.getByText(dict.pages.formErrorsBar(2))).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("counts the text against the 100 000 limit under the editor", async () => {
    renderWithProviders(
      <PageForm
        id="page-1"
        defaultValues={{ title: "Доставка", content: "<p>Текст</p>" }}
        onSubmit={noop}
        isPending={false}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(f.contentCounter(nf(12), nf(MAX_PAGE_CONTENT_LENGTH))),
      ).toBeInTheDocument(),
    );
  });

  it("refuses a text over the limit and says by how much (TASK-1154)", async () => {
    const onSubmit = jest.fn();
    const long = `<p>${"а".repeat(MAX_PAGE_CONTENT_LENGTH)}</p>`;
    const over = long.length - MAX_PAGE_CONTENT_LENGTH;
    renderWithProviders(
      <PageForm
        id="page-1"
        defaultValues={{ title: "Довга", content: long }}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(f.contentOver(nf(over)))).toBeInTheDocument(),
    );
    await userEvent.click(submitButton());

    expect(
      await screen.findByText(
        f.contentMax(nf(MAX_PAGE_CONTENT_LENGTH), nf(over)),
      ),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("publishes through a three-way switch; «Заплановано» asks for the date", async () => {
    renderWithProviders(<PageForm onSubmit={noop} isPending={false} />);

    const group = screen.getByRole("radiogroup", { name: f.statusAria });
    expect(
      within(group).getByRole("radio", { name: f.statusDraft }),
    ).toBeChecked();
    expect(screen.getByText(f.statusHintDraft)).toBeInTheDocument();
    expect(screen.queryByLabelText(f.scheduledAt)).not.toBeInTheDocument();

    await userEvent.click(
      within(group).getByRole("radio", { name: f.statusScheduled }),
    );
    expect(screen.getByLabelText(f.scheduledAt)).toBeInTheDocument();
  });

  it("warns next to the address and the status of a page /info renders inline", async () => {
    renderWithProviders(
      <PageForm
        id="page-1"
        defaultValues={{
          title: "Доставка",
          slug: "info-delivery",
          kind: "INFO",
          status: "PUBLISHED",
          content: "<p>x</p>",
        }}
        onSubmit={noop}
        isPending={false}
      />,
    );

    expect(
      await screen.findByText(dict.pages.inlinedOnInfoHint),
    ).toBeInTheDocument();
    expect(
      screen.getByText(f.statusHintInlined("Доставка")),
    ).toBeInTheDocument();
  });

  it("is read-only without the right: fields disabled, no save, says why", () => {
    renderWithProviders(
      <PageForm
        id="page-1"
        defaultValues={{ title: "Доставка", content: "<p>x</p>" }}
        onSubmit={noop}
        isPending={false}
        readOnly
      />,
    );

    expect(titleField()).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: f.submit }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(dict.common.viewOnly)).toBeInTheDocument();
  });
});

// The preview is the owner's only feedback loop for what <head> will say, so
// where it disagrees with the storefront it is worse than no preview at all.
describe("PageForm — preview parity with the storefront", () => {
  const previewDescription = () =>
    screen.queryByTestId("seo-snippet-description");

  // TASK-433 — the store name became an admin-managed field.
  it("brands the title with the store name from /settings/seo, not the constant", async () => {
    server.use(
      http.get("*/api/seo-settings", () =>
        HttpResponse.json({
          data: {
            id: "00000000-0000-0000-0000-000000000002",
            siteName: "Аксесуарня",
            defaultMetaTitle: null,
            defaultMetaDescription: null,
            titleTemplate: null,
            defaultOgImage: null,
            logoUrl: null,
            noindexSite: false,
            llmsTxtSummary: null,
            additionalSameAsLinks: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        }),
      ),
    );

    renderWithProviders(
      <PageForm
        id="page-1"
        defaultValues={{ title: "Доставка та оплата", content: "<p>x</p>" }}
        onSubmit={noop}
        isPending={false}
      />,
    );

    await waitFor(() =>
      expect(previewTitle()).toHaveTextContent(
        "Доставка та оплата | Аксесуарня",
      ),
    );
  });

  // TASK-435 — a hub's description comes from the EXCERPT only.
  it("stops deriving a hub description from the body", async () => {
    renderWithProviders(
      <PageForm
        id="page-hub"
        defaultValues={{
          title: "Розділ «Блог»",
          content: "<p>SEO-картка розділу.</p>",
        }}
        onSubmit={noop}
        isPending={false}
      />,
    );

    await waitFor(() =>
      expect(previewDescription()).toHaveTextContent("SEO-картка розділу."),
    );

    await pickKind(f.kindHub);

    await waitFor(() => expect(previewDescription()).toBeNull());
  });

  it("stops showing the global default as a hub's description", async () => {
    server.use(
      http.get("*/api/seo-settings", () =>
        HttpResponse.json({
          data: {
            id: "00000000-0000-0000-0000-000000000002",
            siteName: null,
            defaultMetaTitle: null,
            defaultMetaDescription: "Магазин преміальних аксесуарів",
            titleTemplate: null,
            defaultOgImage: null,
            logoUrl: null,
            noindexSite: false,
            llmsTxtSummary: null,
            additionalSameAsLinks: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        }),
      ),
    );

    renderWithProviders(
      <PageForm
        id="page-hub-2"
        defaultValues={{ title: "Розділ «Блог»" }}
        onSubmit={noop}
        isPending={false}
      />,
    );

    await waitFor(() =>
      expect(previewDescription()).toHaveTextContent(
        "Магазин преміальних аксесуарів",
      ),
    );

    await pickKind(f.kindHub);

    await waitFor(() => expect(previewDescription()).toBeNull());
  });
});
