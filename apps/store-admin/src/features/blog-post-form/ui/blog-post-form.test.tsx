import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { BlogPostForm } from "./blog-post-form";

// Same lightweight controlled <textarea> proxy as page-form.test.tsx: Tiptap
// touches the DOM on init, and the preview-tab tests need to drive the
// `content` field with userEvent.type. Resolves to the module the
// `@/shared/ui` barrel re-exports.
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
