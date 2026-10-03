import { render, screen } from "@/shared/test/render";
import { Callout } from "./callout";
import { FormAlert } from "./form-alert";

/**
 * FormAlert — a SERVER refusal of the whole form (Login П2: «Невірний email або
 * пароль.»), as opposed to a field error. Announced, tinted, with an icon so
 * the colour is not the only signal.
 */
describe("FormAlert", () => {
  it("is an announced, destructive-tinted block with an icon", () => {
    const { container } = render(
      <FormAlert>Невірний email або пароль.</FormAlert>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Невірний email або пароль.");
    expect(alert).toHaveClass(
      "border-destructive/45",
      "bg-destructive/6",
      "text-destructive",
    );
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("renders nothing without a message", () => {
    const { container } = render(<FormAlert>{null}</FormAlert>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Callout", () => {
  it.each([
    ["muted", "bg-muted"],
    ["warning", "bg-warning/8"],
    ["primary", "bg-primary/5"],
    ["strip", "bg-muted"],
  ] as const)("paints the %s variant", (variant, tint) => {
    render(
      <Callout variant={variant} data-testid="c">
        Текст
      </Callout>,
    );
    expect(screen.getByTestId("c")).toHaveClass(tint);
    expect(screen.getByTestId("c")).toHaveAttribute("data-variant", variant);
  });

  it("carries a title and actions in the primary variant", () => {
    render(
      <Callout
        variant="primary"
        title="Ця пошта вже належить клієнту — Дмитро Ткаченко"
        actions={<button type="button">Так</button>}
      >
        2 замовлення · клієнт з 25.09.2026.
      </Callout>,
    );
    expect(
      screen.getByText("Ця пошта вже належить клієнту — Дмитро Ткаченко"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Так" })).toBeInTheDocument();
  });

  it("is not a live region — it is page content, not an event", () => {
    render(<Callout>Шаблон — готовий набір галочок.</Callout>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
