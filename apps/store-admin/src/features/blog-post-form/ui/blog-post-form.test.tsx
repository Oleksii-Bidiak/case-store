import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import {
  MEDIA_PERMISSIONS,
  makeMediaAsset,
  stubMediaLibrary,
} from "@/features/media-picker/model/media-picker.fixture";
import { BlogPostForm } from "./blog-post-form";

// Same lightweight controlled <textarea> proxy as page-form.test.tsx: Tiptap
// touches the DOM on init, and the preview-tab tests need to drive the
// `content` field with userEvent.type. Resolves to the module the
// `@/shared/ui` barrel re-exports.
//
// It renders the `imagePicker` slot (TASK-547) so the test below can see that
// this form really fills it. The insert callback is a no-op: what the editor
// then DOES with an image is `rich-text-editor.test.tsx`'s subject, and driving
// a real Tiptap instance here would pull the whole editor into every one of
// these tests for nothing.
jest.mock("@/shared/ui/rich-text-editor", () => ({
  __esModule: true,
  RichTextEditor: ({
    value,
    onChange,
    placeholder,
    imagePicker,
  }: {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    imagePicker?: (insert: (image: unknown) => void) => React.ReactNode;
  }) => (
    <div>
      {imagePicker?.(() => {})}
      <textarea
        data-testid="rte-stub"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  ),
}));

const noop = () => {};

// The form self-fetches the category select options; no default handler exists
// for this endpoint, so stub it here (the shared MSW server runs with
// onUnhandledRequest: "error").
beforeEach(() => {
  server.use(
    http.get("*/api/admin/blog/categories", () =>
      HttpResponse.json({
        data: [
          {
            id: "cat-1",
            name: "Огляди",
            slug: "ohliady",
            sortOrder: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    ),
  );
});

describe("BlogPostForm — media library picker (TASK-441/547)", () => {
  const COVER_URL = "http://localhost:3001/uploads/media/cover.webp";

  it("writes the picked asset's URL into the cover field", async () => {
    stubMediaLibrary([
      makeMediaAsset("m1", { alt: "Обкладинка огляду", url: COVER_URL }),
    ]);
    renderWithProviders(<BlogPostForm onSubmit={noop} isPending={false} />, {
      auth: { permissions: MEDIA_PERMISSIONS },
    });

    // Two pickers on this form — the cover field's and the editor's — so the
    // click has to go to the first, not to "a button with that name".
    const triggers = await screen.findAllByRole("button", {
      name: dict.mediaPicker.trigger,
    });
    await userEvent.click(triggers[0]);
    await userEvent.click(
      await screen.findByRole("button", {
        name: dict.mediaPicker.pickCardAria("Обкладинка огляду"),
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByLabelText(dict.blogPostForm.coverImageUrl),
      ).toHaveValue(COVER_URL),
    );
  });

  it("fills the editor's image slot too", async () => {
    stubMediaLibrary();
    renderWithProviders(<BlogPostForm onSubmit={noop} isPending={false} />, {
      auth: { permissions: MEDIA_PERMISSIONS },
    });

    // The slot is filled by THIS form; what the editor does with the image is
    // proved in `rich-text-editor.test.tsx` and `media-picker-editor-button`.
    expect(
      await screen.findByRole("button", {
        name: dict.mediaPicker.editorInsert,
      }),
    ).toBeInTheDocument();
  });

  it("offers neither picker to an operator with no media keys", async () => {
    renderWithProviders(<BlogPostForm onSubmit={noop} isPending={false} />);

    await screen.findByLabelText(dict.blogPostForm.coverImageUrl);
    expect(
      screen.queryByRole("button", { name: dict.mediaPicker.trigger }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.mediaPicker.editorInsert }),
    ).not.toBeInTheDocument();
  });
});

describe("BlogPostForm — existing fields smoke (TASK-266 baseline coverage)", () => {
  it("renders every field of the form", async () => {
    renderWithProviders(<BlogPostForm onSubmit={noop} isPending={false} />);

    const f = dict.blogPostForm;
    expect(screen.getByLabelText(f.title)).toBeInTheDocument();
    expect(screen.getByLabelText(f.slug)).toBeInTheDocument();
    expect(screen.getByLabelText(f.category)).toBeInTheDocument();
    expect(screen.getByLabelText(f.excerpt)).toBeInTheDocument();
    expect(screen.getByLabelText(f.author)).toBeInTheDocument();
    expect(screen.getByLabelText(f.coverImageUrl)).toBeInTheDocument();
    expect(screen.getByLabelText(f.readingMinutes)).toBeInTheDocument();
    expect(screen.getByLabelText(f.featured)).toBeInTheDocument();
    expect(screen.getByLabelText(f.status)).toBeInTheDocument();
    expect(screen.getByTestId("rte-stub")).toBeInTheDocument();

    // Category options arrive from the (stubbed) admin endpoint.
    expect(
      await screen.findByRole("option", { name: "Огляди" }),
    ).toBeInTheDocument();
  });

  it("validates required fields on an empty submit and does not call onSubmit", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<BlogPostForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.click(
      screen.getByRole("button", { name: dict.blogPostForm.submit }),
    );

    const e = dict.blogPostForm.errors;
    expect(await screen.findByText(e.titleRequired)).toBeInTheDocument();
    expect(screen.getByText(e.excerptRequired)).toBeInTheDocument();
    expect(screen.getByText(e.contentRequired)).toBeInTheDocument();
    // "Оберіть категорію" is also the select's placeholder option text — scope
    // the error assertion to the role="alert" paragraphs.
    const alerts = screen
      .getAllByRole("alert")
      .map((alert) => alert.textContent);
    expect(alerts).toContain(e.categoryRequired);
    expect(alerts).toContain(e.authorRequired);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the live slug preview derived from the title", async () => {
    renderWithProviders(<BlogPostForm onSubmit={noop} isPending={false} />);

    await userEvent.type(
      screen.getByLabelText(dict.blogPostForm.title),
      "Огляд iPhone",
    );

    await waitFor(() =>
      expect(screen.getByTestId("slug-preview")).toBeInTheDocument(),
    );
  });
});

// TASK-437 — the article form had no SEO section at all: no meta fields, no
// tags, no snippet preview. These tests pin the section's existence and the one
// thing an operator can get wrong silently — the address in the preview.
describe("BlogPostForm — SEO section (TASK-437)", () => {
  it("renders the meta overrides, the shared tag/OG pair and the snippet preview", async () => {
    renderWithProviders(<BlogPostForm onSubmit={noop} isPending={false} />);

    expect(
      screen.getByLabelText(dict.blogPostForm.metaTitle),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(dict.blogPostForm.metaDescription),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(dict.seoFields.keywords)).toBeInTheDocument();
    expect(screen.getByLabelText(dict.seoFields.ogImage)).toBeInTheDocument();
    expect(
      await screen.findByTestId("seo-snippet-preview"),
    ).toBeInTheDocument();
  });

  it("says out loud that the tags are not a Google meta tag", () => {
    renderWithProviders(<BlogPostForm onSubmit={noop} isPending={false} />);

    expect(screen.getByText(dict.seoFields.keywordsHint)).toBeInTheDocument();
  });

  it("previews the article's real address: /blog/<slug>", async () => {
    renderWithProviders(<BlogPostForm onSubmit={noop} isPending={false} />);

    await userEvent.type(
      screen.getByLabelText(dict.blogPostForm.slug),
      "iphone16-vs-15",
    );

    await waitFor(() =>
      expect(screen.getByTestId("seo-snippet-url")).toHaveTextContent(
        "blog › iphone16-vs-15",
      ),
    );
  });

  it("falls back to the post title in the preview until a meta title is typed", async () => {
    renderWithProviders(<BlogPostForm onSubmit={noop} isPending={false} />);

    await userEvent.type(
      screen.getByLabelText(dict.blogPostForm.title),
      "Огляд iPhone",
    );
    await waitFor(() =>
      expect(screen.getByTestId("seo-snippet-title")).toHaveTextContent(
        "Огляд iPhone",
      ),
    );

    await userEvent.type(
      screen.getByLabelText(dict.blogPostForm.metaTitle),
      "Свій заголовок для видачі",
    );
    await waitFor(() =>
      expect(screen.getByTestId("seo-snippet-title")).toHaveTextContent(
        "Свій заголовок для видачі",
      ),
    );
  });

  it("rejects a tag list longer than the API accepts, before any request", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<BlogPostForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(
      screen.getByLabelText(dict.seoFields.keywords),
      Array.from({ length: 21 }, (_, i) => `tag${i}`).join(","),
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.blogPostForm.submit }),
    );

    expect(
      await screen.findByText(dict.seoFields.errors.keywordsCount(20)),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("BlogPostForm — content preview tab (TASK-266)", () => {
  it("renders typed content in the «Перегляд» tab through RichTextPreview", async () => {
    renderWithProviders(<BlogPostForm onSubmit={noop} isPending={false} />);

    await userEvent.type(
      screen.getByTestId("rte-stub"),
      "<h2>Вступ</h2><p>Текст статті.</p>",
    );

    await userEvent.click(
      screen.getByRole("tab", { name: dict.contentPreview.tabPreview }),
    );

    const preview = screen.getByTestId("rich-text-preview");
    expect(
      screen.getByRole("heading", { level: 2, name: "Вступ" }),
    ).toBeInTheDocument();
    expect(preview).toHaveTextContent("Текст статті.");

    // Tab back: the controlled editor re-seeds from the RHF field, no loss.
    await userEvent.click(
      screen.getByRole("tab", { name: dict.contentPreview.tabEdit }),
    );
    expect(screen.getByTestId("rte-stub")).toHaveValue(
      "<h2>Вступ</h2><p>Текст статті.</p>",
    );
  });

  it("shows the empty placeholder in the preview tab before typing", async () => {
    renderWithProviders(<BlogPostForm onSubmit={noop} isPending={false} />);

    await userEvent.click(
      screen.getByRole("tab", { name: dict.contentPreview.tabPreview }),
    );

    expect(screen.getByTestId("rich-text-preview")).toHaveTextContent(
      dict.contentPreview.emptyContent,
    );
  });
});
