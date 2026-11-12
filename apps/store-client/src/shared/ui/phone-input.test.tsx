import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneInput } from "./phone-input";

// `formatUAPhone` moved to `shared/lib/phone.ts` alongside the validation rule
// (TASK-407); its cases live in `shared/lib/phone.test.ts`.

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

  // TASK-1984 (Rule 5b): the field emits the SANITISED raw string — characters
  // outside the PHONE_SHAPE alphabet never reach the form, and nothing is cut.
  describe("drops characters outside the phone alphabet", () => {
    function Controlled({ onEmit }: { onEmit: (value: string) => void }) {
      const [value, setValue] = React.useState("");
      return (
        <PhoneInput
          aria-label="phone"
          value={value}
          onChange={(next) => {
            onEmit(next);
            setValue(next);
          }}
        />
      );
    }

    it("emits no letters when a number with letters is pasted", async () => {
      const onEmit = jest.fn();
      const user = userEvent.setup();
      render(<Controlled onEmit={onEmit} />);

      const input = screen.getByLabelText("phone");
      await user.clear(input);
      await user.paste("050 111 2233 ccc");

      const emitted = onEmit.mock.calls.map(([value]) => value as string);
      expect(emitted.length).toBeGreaterThan(0);
      expect(emitted.every((value) => !/[a-zа-яіїєґ]/i.test(value))).toBe(true);
      // Nothing but the letters is removed — the number itself arrives whole.
      expect(emitted.at(-1)).toContain("050 111 2233");
    });

    it("emits no letters when they are typed", async () => {
      const onEmit = jest.fn();
      const user = userEvent.setup();
      render(<Controlled onEmit={onEmit} />);

      await user.type(screen.getByLabelText("phone"), "50x1ф");

      const emitted = onEmit.mock.calls.map(([value]) => value as string);
      expect(emitted.every((value) => !/[a-zа-яіїєґ]/i.test(value))).toBe(true);
    });

    it("keeps digits, spaces and + ( ) . - untouched and never truncates", () => {
      const onChange = jest.fn();
      render(<PhoneInput aria-label="phone" value="" onChange={onChange} />);

      fireEvent.change(screen.getByLabelText("phone"), {
        target: { value: "+38 (050) 111-22.33 4455" },
      });

      expect(onChange).toHaveBeenCalledWith("+38 (050) 111-22.33 4455");
    });
  });
});
