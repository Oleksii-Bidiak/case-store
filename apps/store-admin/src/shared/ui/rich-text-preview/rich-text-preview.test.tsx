import { render, screen } from "@testing-library/react";
import { dict } from "@/shared/config";
import { RichTextPreview } from "./rich-text-preview";

const HTML = [
  "<h2>Заголовок</h2>",
  "<p>Перший абзац тексту.</p>",
  "<ul><li>Пункт один</li><li>Пункт два</li></ul>",
  "<blockquote><p>Цитата дня.</p></blockquote>",
].join("");

describe("RichTextPreview (TASK-266)", () => {
  it("renders known HTML through the prose wrapper", () => {
    render(<RichTextPreview html={HTML} />);

    const preview = screen.getByTestId("rich-text-preview");
    const prose = preview.firstElementChild as HTMLElement;

    // Prose classes on the wrapper (ported storefront typography).
    expect(prose.className).toContain("[&_h2]:font-display");
    expect(prose.className).toContain("[&_blockquote]:border-primary");

    expect(
      screen.getByRole("heading", { level: 2, name: "Заголовок" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Перший абзац тексту.")).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(prose.querySelector("blockquote")).toHaveTextContent("Цитата дня.");
  });

  it("shows the empty placeholder for an empty string", () => {
    render(<RichTextPreview html="" emptyLabel="Порожньо" />);

    expect(screen.getByText("Порожньо")).toBeInTheDocument();
  });

  it("shows the placeholder for whitespace-only and tag-only HTML", () => {
    const { rerender } = render(<RichTextPreview html="   " />);
    expect(
      screen.getByText(dict.contentPreview.emptyContent),
    ).toBeInTheDocument();

    // Tiptap emits "<p></p>" for a cleared document — still "empty".
    rerender(<RichTextPreview html="<p></p>" />);
    expect(
      screen.getByText(dict.contentPreview.emptyContent),
    ).toBeInTheDocument();
  });
});
