import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import { PageForm } from "./page-form";

// The rich-text body editor (Tiptap) is irrelevant to the SERP-preview wiring
// under test and touches the DOM on init; stub it to a no-op so these tests stay
// deterministic. Resolves to the same module the `@/shared/ui` barrel re-exports.
jest.mock("@/shared/ui/rich-text-editor", () => ({
  __esModule: true,
  RichTextEditor: () => null,
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
        "Доставка та оплата | MobileStore",
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
    expect(previewTitle()).not.toHaveTextContent("| MobileStore");
    expect(previewHint()).toHaveTextContent(dict.seoSnippetPreview.hintOwn);
    expect(titleCounter()).toHaveTextContent("8/60");
  });

  it("shows the empty-tier hint before any title is entered", () => {
    renderWithProviders(<PageForm onSubmit={noop} isPending={false} />);

    expect(previewHint()).toHaveTextContent(dict.seoSnippetPreview.hintEmpty);
    expect(previewTitle()).toHaveTextContent(dict.seoSnippetPreview.emptyTitle);
  });
});
