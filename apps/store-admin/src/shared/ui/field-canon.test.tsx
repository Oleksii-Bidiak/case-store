import { render, screen } from "@/shared/test/render";
import { FieldError } from "./field-error";
import { Input } from "./input";
import { Label } from "./label";
import { Select, SelectTrigger, SelectValue } from "./select";
import { Textarea } from "./textarea";

/**
 * Form-field canon 1.5 (Login П1, Profile П3): an invalid field is a red
 * border PLUS a 3 px destructive ring at rest — not only while focused — and
 * the reason sits under it, wired to the field with `aria-describedby`.
 *
 * jsdom has no layout, so the visual half is asserted on the utility classes;
 * the accessibility half is asserted the way assistive tech reads it.
 */

const INVALID = [
  "aria-invalid:border-destructive",
  "aria-invalid:ring-3",
  "aria-invalid:ring-destructive/20",
];

describe("field canon — invalid state", () => {
  it.each([
    ["Input", () => render(<Input aria-label="Email" aria-invalid />)],
    ["Textarea", () => render(<Textarea aria-label="Опис" aria-invalid />)],
    [
      "SelectTrigger",
      () =>
        render(
          <Select>
            <SelectTrigger aria-label="Бренд" aria-invalid>
              <SelectValue />
            </SelectTrigger>
          </Select>,
        ),
    ],
  ])("%s paints border and ring when aria-invalid", (_name, mount) => {
    mount();
    const field = screen.queryByRole("textbox") ?? screen.getByRole("combobox");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveClass(...INVALID);
  });

  it("describes the field with its error and announces the error", () => {
    render(
      <>
        <Label htmlFor="email">Електронна пошта</Label>
        <Input id="email" aria-invalid aria-describedby="email-error" />
        <FieldError id="email-error">
          Введіть коректну електронну пошту
        </FieldError>
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Електронна пошта" });
    expect(input).toHaveAccessibleDescription(
      "Введіть коректну електронну пошту",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Введіть коректну електронну пошту",
    );
    expect(screen.getByRole("alert")).toHaveClass("text-destructive");
  });

  it("renders no error element without a message", () => {
    const { container } = render(<FieldError id="x">{undefined}</FieldError>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Label required", () => {
  it("adds a visual asterisk that is not part of the accessible name", () => {
    render(
      <>
        <Label htmlFor="name" required>
          Назва
        </Label>
        <Input id="name" required />
      </>,
    );
    expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
    // The requirement itself is conveyed by `required` on the control.
    expect(screen.getByRole("textbox", { name: "Назва" })).toBeRequired();
  });

  it("renders no asterisk by default", () => {
    render(<Label>Бренд</Label>);
    expect(screen.queryByText("*")).not.toBeInTheDocument();
  });
});
