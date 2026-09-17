import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { http, HttpResponse } from "msw";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { PageForm } from "./page-form";

// The rich-text body editor (Tiptap) touches the DOM on init; stub it so these
// tests stay deterministic. Resolves to the same module the `@/shared/ui`
// barrel re-exports. Since TASK-266 the stub is a lightweight controlled
// <textarea> proxy (value/onChange passthrough) instead of `() => null`, so the
// preview-tab tests below can drive the `content` field with userEvent.type;
// the SERP-preview tests never interact with the editor and are unaffected.
jest.mock("@/shared/ui/rich-text-editor", () => ({
  __esModule: true,
  RichTextEditor: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      data-testid="rte-stub"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  ),
}));

const noop = () => {};

const previewTitle = () => screen.getByTestId("seo-snippet-title");
const previewHint = () => screen.getByTestId("seo-snippet-hint");
const titleCounter = () => screen.getByTestId("seo-snippet-title-counter");
const metaTitleField = () => screen.getByLabelText(dict.pageForm.metaTitle);

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
    // Own title used verbatim (no brand suffix) → tier "own".
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
    // The editor tab unmounted (Radix default) — value survives in RHF state.
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

// TASK-435 — the form now decides WHAT a row is, and the kind decides where it
// lives. Two things must not be possible: a hub with an invented address, and a
// SERP preview that shows an address the page will not actually have.
describe("PageForm — page kind (TASK-435)", () => {
  const kindField = () => screen.getByLabelText(dict.pageForm.kind);
  const previewUrl = () => screen.getByTestId("seo-snippet-url");

  it("defaults to a legal page, and previews it under /legal", async () => {
    renderWithProviders(
      <PageForm
        id="page-1"
        defaultValues={{ title: "Оферта", slug: "offer", content: "<p>x</p>" }}
        onSubmit={noop}
        isPending={false}
      />,
    );

    await waitFor(() => expect(kindField()).toHaveValue("LEGAL"));
    expect(previewUrl()).toHaveTextContent("legal › offer");
  });

  it("moves the previewed address to /info when the kind becomes a help page", async () => {
    renderWithProviders(
      <PageForm
        id="page-1"
        defaultValues={{ title: "Про нас", slug: "about", content: "<p>x</p>" }}
        onSubmit={noop}
        isPending={false}
      />,
    );
    await waitFor(() =>
      expect(previewUrl()).toHaveTextContent("legal › about"),
    );

    await userEvent.selectOptions(kindField(), "INFO");

    await waitFor(() => expect(previewUrl()).toHaveTextContent("info › about"));
    expect(previewUrl()).not.toHaveTextContent("legal");
  });

  it("replaces the free-text slug with a picker of real sections for a hub", async () => {
    renderWithProviders(<PageForm onSubmit={noop} isPending={false} />);

    expect(screen.getByLabelText(dict.pageForm.slug)).toBeInTheDocument();

    await userEvent.selectOptions(kindField(), "HUB");

    // The free-text field is gone — a hub address cannot be typed.
    expect(screen.queryByLabelText(dict.pageForm.slug)).not.toBeInTheDocument();
    const picker = screen.getByLabelText(dict.pageForm.hubSlug);
    expect(picker).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "/blog" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "/categories" }),
    ).toBeInTheDocument();
  });

  it("previews a hub at the section's own route, with no slug segment after it", async () => {
    renderWithProviders(<PageForm onSubmit={noop} isPending={false} />);

    await userEvent.selectOptions(kindField(), "HUB");
    await userEvent.selectOptions(
      screen.getByLabelText(dict.pageForm.hubSlug),
      "blog",
    );

    await waitFor(() => expect(previewUrl()).toHaveTextContent("› blog"));
    expect(previewUrl()).not.toHaveTextContent("legal");
    expect(previewUrl()).not.toHaveTextContent("info");
  });

  it("refuses to submit a hub with no section chosen", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<PageForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(screen.getByTestId("rte-stub"), "<p>Текст</p>");
    await userEvent.type(screen.getByLabelText(dict.pageForm.title), "Хаб");
    await userEvent.selectOptions(kindField(), "HUB");
    await userEvent.click(screen.getByRole("button", { name: /Зберегти/ }));

    expect(
      await screen.findByText(dict.pageForm.errors.hubSlugRequired),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the chosen kind and hub slug", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<PageForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(screen.getByTestId("rte-stub"), "<p>Текст</p>");
    await userEvent.type(
      screen.getByLabelText(dict.pageForm.title),
      "Розділ «Блог»",
    );
    await userEvent.selectOptions(kindField(), "HUB");
    await userEvent.selectOptions(
      screen.getByLabelText(dict.pageForm.hubSlug),
      "blog",
    );
    await userEvent.click(screen.getByRole("button", { name: /Зберегти/ }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      kind: "HUB",
      slug: "blog",
    });
  });

  it("tells the operator a hub body is never shown on the site", async () => {
    renderWithProviders(<PageForm onSubmit={noop} isPending={false} />);

    expect(
      screen.queryByText(dict.pageForm.hubContentHint),
    ).not.toBeInTheDocument();

    await userEvent.selectOptions(kindField(), "HUB");

    expect(screen.getByText(dict.pageForm.hubContentHint)).toBeInTheDocument();
  });

  // TASK-437 — the same tag/OG pair as the other three content forms, with the
  // hint that keeps the tags from being mistaken for a Google ranking signal.
  it("renders the tag and OG fields with their honest hint", () => {
    renderWithProviders(<PageForm onSubmit={noop} isPending={false} />);

    expect(screen.getByLabelText(dict.seoFields.keywords)).toBeInTheDocument();
    expect(screen.getByLabelText(dict.seoFields.ogImage)).toBeInTheDocument();
    expect(screen.getByText(dict.seoFields.keywordsHint)).toBeInTheDocument();
  });
});

// The preview is the owner's only feedback loop for what <head> will say, so
// where it disagrees with the storefront it is worse than no preview at all.
describe("PageForm — preview parity with the storefront", () => {
  const kindField = () => screen.getByLabelText(dict.pageForm.kind);
  // The description <p> is not rendered at all when the resolved value is empty,
  // so "no description" is queried, not asserted on a present node.
  const previewDescription = () =>
    screen.queryByTestId("seo-snippet-description");

  // TASK-433 — the store name became an admin-managed field; the preview kept
  // branding with the compile-time constant.
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

  // TASK-435 — `buildHubMetadata` derives a hub's description from the EXCERPT
  // only (the body is never rendered) and deliberately blanks the store-wide
  // defaults. A preview that showed the body would promise text <head> cannot
  // carry.
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

    await userEvent.selectOptions(kindField(), "HUB");

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

    await userEvent.selectOptions(kindField(), "HUB");

    await waitFor(() => expect(previewDescription()).toBeNull());
  });
});
