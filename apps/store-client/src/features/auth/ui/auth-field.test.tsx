import { createRef } from "react";
import { renderWithProviders, screen } from "@/shared/test/render";
import { AuthField } from "./auth-field";

describe("AuthField (TASK-871)", () => {
  it("labels the shared Input and keeps the 44px touch target", () => {
    renderWithProviders(<AuthField id="f-email" label="Email" type="email" />);

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("id", "f-email");
    expect(input).toHaveAttribute("data-slot", "input");
    expect(input).toHaveClass("h-11");
    expect(input).not.toHaveClass("h-9");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("links the hint while there is no error", () => {
    renderWithProviders(
      <AuthField id="f-pass" label="Пароль" hint="Щонайменше 8 символів" />,
    );

    expect(screen.getByLabelText("Пароль")).toHaveAccessibleDescription(
      "Щонайменше 8 символів",
    );
  });

  it("replaces the hint with the error and marks the field invalid", () => {
    renderWithProviders(
      <AuthField
        id="f-pass"
        label="Пароль"
        hint="Щонайменше 8 символів"
        error="Пароль має містити щонайменше 8 символів"
      />,
    );

    const input = screen.getByLabelText("Пароль");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "f-pass-error");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Пароль має містити щонайменше 8 символів",
    );
    expect(screen.queryByText("Щонайменше 8 символів")).not.toBeInTheDocument();
  });

  it("forwards the ref, so react-hook-form's register() can attach", () => {
    const ref = createRef<HTMLInputElement>();
    renderWithProviders(<AuthField id="f-x" label="X" ref={ref} />);

    expect(ref.current).toBe(screen.getByLabelText("X"));
  });
});
