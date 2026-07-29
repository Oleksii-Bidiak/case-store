import { renderWithProviders, screen } from "@/shared/test/render";
import { RichText, looksLikeHtml } from "./rich-text";

describe("looksLikeHtml (TASK-361)", () => {
  it.each([
    "<p>abc</p>",
    "Рядок<br />Другий",
    "<ul><li>один</li></ul>",
    "<STRONG>кричить</STRONG>",
  ])("detects markup in %p", (value) => {
    expect(looksLikeHtml(value)).toBe(true);
  });

  // The whole point of the narrow tag list: prose that merely contains angle
  // brackets is plain text, and must keep its line breaks.
  it.each(["Просто текст", "Ширина < 10 мм, вага > 3 г", "5 < 10 > 3", ""])(
    "treats %p as plain text",
    (value) => {
      expect(looksLikeHtml(value)).toBe(false);
    },
  );
});

describe("RichText", () => {
  it("renders sanitized markup as elements", () => {
    renderWithProviders(<RichText content="<p>Привіт <em>світ</em></p>" />);

    expect(screen.getByText("світ").tagName).toBe("EM");
    expect(screen.queryByText(/<p>/)).toBeNull();
  });

  it("renders plain text in a pre-line block so line breaks survive", () => {
    renderWithProviders(<RichText content={"Рядок 1\nРядок 2"} />);

    const block = screen.getByText(/Рядок 1/);
    expect(block).toHaveClass("whitespace-pre-line");
    expect(block.textContent).toContain("\n");
  });
});
