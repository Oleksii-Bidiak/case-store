import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatUAPhone, PhoneInput } from "./phone-input";

describe("formatUAPhone", () => {
  it.each([
    ["", "+380"],
    ["0501234567", "+380 50 123 4567"],
    ["380501234567", "+380 50 123 4567"],
    ["+380501234567", "+380 50 123 4567"],
    ["+380 50 123 4", "+380 50 123 4"],
    ["12345678901", "+380 12 345 6789"],
    ["80501234567", "+380 50 123 4567"],
  ])("formats %p as %p", (input, expected) => {
    expect(formatUAPhone(input)).toBe(expected);
  });
});

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

  it("sets type=tel and inputMode=numeric for the mobile keyboard", () => {
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

    // The component emits the raw `e.target.value`; React applies the formatted
    // value on the next render, so the raw event value is `"+3805"`.
    expect(onChange).toHaveBeenCalledWith("+3805");
  });
});
