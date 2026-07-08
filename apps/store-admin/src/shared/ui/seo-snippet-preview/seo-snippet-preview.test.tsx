import { render, screen } from "@testing-library/react";
import { dict } from "@/shared/config";
import { SeoSnippetPreview, type SeoSnippetPreviewProps } from ".";

const d = dict.seoSnippetPreview;

const baseProps: SeoSnippetPreviewProps = {
  title: "Best iPhone 15 Case | MobileStore",
  titleTier: "own",
  description: "Shop the best clear case for iPhone 15.",
  descriptionTier: "own",
  url: "mobilestore.ua › products › clear-case",
  rawTitleLength: 20,
  rawDescriptionLength: 40,
};

function renderPreview(overrides: Partial<SeoSnippetPreviewProps> = {}) {
  return render(<SeoSnippetPreview {...baseProps} {...overrides} />);
}

describe("SeoSnippetPreview — rendering", () => {
  it("renders the title, green URL, and description from props", () => {
    renderPreview();
    expect(screen.getByTestId("seo-snippet-title")).toHaveTextContent(
      "Best iPhone 15 Case | MobileStore",
    );
    expect(screen.getByTestId("seo-snippet-url")).toHaveTextContent(
      "mobilestore.ua › products › clear-case",
    );
    expect(screen.getByTestId("seo-snippet-description")).toHaveTextContent(
      "Shop the best clear case for iPhone 15.",
    );
  });

  it("renders the empty-title placeholder when title is blank", () => {
    renderPreview({ title: "", titleTier: "empty" });
    expect(screen.getByTestId("seo-snippet-title")).toHaveTextContent(
      d.emptyTitle,
    );
  });

  it("renders NO description line when description is undefined", () => {
    renderPreview({ description: undefined, descriptionTier: "empty" });
    expect(
      screen.queryByTestId("seo-snippet-description"),
    ).not.toBeInTheDocument();
  });
});

describe("SeoSnippetPreview — counters", () => {
  it("renders {typed}/60 and {typed}/155 counters", () => {
    renderPreview({ rawTitleLength: 42, rawDescriptionLength: 120 });
    expect(screen.getByTestId("seo-snippet-title-counter")).toHaveTextContent(
      "42/60",
    );
    expect(
      screen.getByTestId("seo-snippet-description-counter"),
    ).toHaveTextContent("120/155");
  });

  it("keeps the title counter muted at/under the limit and flips to destructive past it", () => {
    const { rerender } = renderPreview({ rawTitleLength: 60 });
    const counter = () => screen.getByTestId("seo-snippet-title-counter");
    expect(counter()).toHaveClass("text-muted-foreground");
    expect(counter()).not.toHaveClass("text-destructive");

    rerender(<SeoSnippetPreview {...baseProps} rawTitleLength={61} />);
    expect(counter()).toHaveClass("text-destructive");
  });

  it("flips the description counter to destructive past 155", () => {
    const { rerender } = renderPreview({ rawDescriptionLength: 155 });
    const counter = () => screen.getByTestId("seo-snippet-description-counter");
    expect(counter()).toHaveClass("text-muted-foreground");

    rerender(<SeoSnippetPreview {...baseProps} rawDescriptionLength={156} />);
    expect(counter()).toHaveClass("text-destructive");
  });
});

describe("SeoSnippetPreview — tier hints", () => {
  const cases: Array<[SeoSnippetPreviewProps["titleTier"], string]> = [
    ["own", d.hintOwn],
    ["default", d.hintDefault],
    ["derived", d.hintDerived],
    ["empty", d.hintEmpty],
  ];

  it.each(cases)("renders the %s hint copy", (tier, copy) => {
    renderPreview({ titleTier: tier });
    expect(screen.getByTestId("seo-snippet-hint")).toHaveTextContent(copy);
  });

  it("renders four distinguishable hint strings", () => {
    const unique = new Set(cases.map(([, copy]) => copy));
    expect(unique.size).toBe(4);
  });
});
