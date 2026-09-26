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

  // TASK-492: every tag the server's sanitizer keeps is rendered AND styled.
  it("renders and styles the rest of the sanitizer's allow-list", () => {
    render(
      <RichTextPreview
        html={[
          "<h1>Головний</h1>",
          "<h4>Дрібний</h4>",
          "<p><s>стара ціна</s> <u>важливо</u> <code>USB-C</code></p>",
          '<img src="https://cdn.example.com/a.jpg" alt="Чохол">',
          "<hr>",
          "<pre><code>const a = 1;</code></pre>",
          "<table><caption>Характеристики</caption>",
          "<tbody><tr><td>Вага</td><td>30 г</td></tr></tbody>",
          "<tfoot><tr><td>Разом</td><td>1</td></tr></tfoot></table>",
        ].join("")}
      />,
    );

    const prose = screen.getByTestId("rich-text-preview")
      .firstElementChild as HTMLElement;

    expect(
      screen.getByRole("heading", { level: 1, name: "Головний" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 4, name: "Дрібний" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Чохол" })).toBeInTheDocument();
    expect(prose.querySelector("hr")).not.toBeNull();
    expect(prose.querySelector("s")).toHaveTextContent("стара ціна");
    expect(prose.querySelector("pre code")).toHaveTextContent("const a = 1;");
    expect(prose.querySelector("caption")).toHaveTextContent("Характеристики");
    expect(prose.querySelector("tfoot")).toHaveTextContent("Разом");

    for (const rule of [
      "[&_h1]:text-3xl",
      "[&_h4]:text-lg",
      "[&_img]:max-w-full",
      "[&_hr]:border-border",
      "[&_s]:line-through",
      "[&_code]:bg-muted",
      "[&_pre]:overflow-x-auto",
      "[&_pre_code]:bg-transparent",
      "[&_caption]:caption-top",
      "[&_tfoot_td]:font-semibold",
    ]) {
      expect(prose.className).toContain(rule);
    }
    // Semantic tokens only — no raw colour values in the prose rules.
    expect(prose.className).not.toMatch(/#[0-9a-f]{3,8}\b/i);
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
