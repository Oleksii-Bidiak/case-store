import * as React from "react";
import { render, screen, userEvent, within } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { PASSWORD_MIN_LENGTH } from "@/shared/lib/password-policy";
import { PasswordInput } from "./password-input";
import { PasswordRequirements } from "./password-requirements";

describe("PasswordInput", () => {
  it("toggles visibility with a pressed-state button inside the field", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Новий пароль" defaultValue="Secret12" />);
    const field = screen.getByLabelText("Новий пароль");
    expect(field).toHaveAttribute("type", "password");

    const toggle = screen.getByRole("button", {
      name: dict.canon.showPassword,
    });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(field).toHaveAttribute("type", "text");
    const hide = screen.getByRole("button", { name: dict.canon.hidePassword });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    // The toggle never submits the form it sits in.
    expect(hide).toHaveAttribute("type", "button");

    await user.click(hide);
    expect(field).toHaveAttribute("type", "password");
  });

  it("forwards the ref and the invalid state to the input", () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<PasswordInput ref={ref} aria-label="Пароль" aria-invalid />);
    expect(ref.current).toBe(screen.getByLabelText("Пароль"));
    expect(ref.current).toHaveAttribute("aria-invalid", "true");
  });
});

describe("PasswordRequirements — mirrors the STAFF policy", () => {
  const items = () =>
    within(
      screen.getByRole("list", { name: dict.canon.passwordRequirementsLabel }),
    ).getAllByRole("listitem");

  const met = (item: HTMLElement) => item.getAttribute("data-met") === "true";

  it("lists the four rules of shared/lib/password-policy", () => {
    render(<PasswordRequirements value="" />);
    expect(items().map((li) => li.firstChild?.textContent ?? "")).toEqual([
      dict.canon.passwordMinLength(PASSWORD_MIN_LENGTH),
      dict.canon.passwordUppercase,
      dict.canon.passwordLowercase,
      dict.canon.passwordDigit,
    ]);
    expect(items().every((li) => !met(li))).toBe(true);
  });

  it("ticks each rule live, Cyrillic letters included", () => {
    const { rerender } = render(<PasswordRequirements value="пароль1" />);
    expect(items().map(met)).toEqual([false, false, true, true]);

    rerender(<PasswordRequirements value="Пароль12" />);
    expect(items().map(met)).toEqual([true, true, true, true]);
  });

  it("tells a screen reader which rules are met, not only by colour", () => {
    render(<PasswordRequirements value="abcdefgh" />);
    const [length, upper] = items();
    expect(length).toHaveTextContent(dict.canon.requirementMet);
    expect(upper).toHaveTextContent(dict.canon.requirementUnmet);
  });
});
