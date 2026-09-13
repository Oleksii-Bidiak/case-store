import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneInput } from "./phone-input";

/**
 * Ported from `apps/store-client/src/shared/ui/phone-input.test.tsx` alongside the
 * component (TASK-426). `formatUAPhone` lives in `shared/lib/phone.ts` next to the
 * validation rule; its cases are in `shared/lib/phone.test.ts`.
 */
describe("PhoneInput", () => {
  it("renders the +380 prefix for an empty value", () => {
    render(<PhoneInput aria-label="phone" value="" onChange={() => {}} />);

    expect(screen.getByLabelText("phone")).toHaveValue("+380");
  });

  it("formats a domestic number on render", () => {
    render(
      <PhoneInput aria-label="phone" value="0501234567" onChange={() => {}} />,
    );

    expect(screen.getByLabelText("phone")).toHaveValue("+380 50 123 4567");
  });

  it("formats a number with the country code and + on render", () => {
    render(
      <PhoneInput
        aria-label="phone"
        value="+380501234567"
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("phone")).toHaveValue("+380 50 123 4567");
  });

  it("preserves a partial value as-is", () => {
    render(
      <PhoneInput aria-label="phone" value="+380 50" onChange={() => {}} />,
    );

    expect(screen.getByLabelText("phone")).toHaveValue("+380 50");
  });

  it("sets type=tel and inputMode=numeric for the right keyboard", () => {
    render(<PhoneInput aria-label="phone" value="" onChange={() => {}} />);

    const input = screen.getByLabelText("phone");
    expect(input).toHaveAttribute("type", "tel");
    expect(input).toHaveAttribute("inputmode", "numeric");
  });

  it("passes aria-invalid through to the input", () => {
    render(
      <PhoneInput
        aria-label="phone"
        value=""
        onChange={() => {}}
        aria-invalid
      />,
    );

    expect(screen.getByLabelText("phone")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("calls onChange with the raw input value", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<PhoneInput aria-label="phone" value="" onChange={onChange} />);

    await user.type(screen.getByLabelText("phone"), "5");

    // The component emits the raw `event.target.value`; React applies the
    // formatted value on the next render, so the raw event value is `"+3805"`.
    expect(onChange).toHaveBeenCalledWith("+3805");
  });

  // React 19: `ref` is an ordinary prop, so it reaches the DOM node through two
  // plain function components. RHF's Controller relies on this to focus an
  // invalid field, and the storefront original used forwardRef for it.
  it("forwards a ref to the underlying input element", () => {
    const ref = createRef<HTMLInputElement>();

    render(
      <PhoneInput ref={ref} aria-label="phone" value="" onChange={() => {}} />,
    );

    expect(ref.current).toBe(screen.getByLabelText("phone"));
  });
});
