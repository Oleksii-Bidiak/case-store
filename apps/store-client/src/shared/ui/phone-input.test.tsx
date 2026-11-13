import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isValidUAPhone } from "@/shared/lib/phone";
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

  // TASK-1984: the field always shows the drawn `+380`, and a shopper pastes or
  // types AFTER it. What reaches the form must still be the number they meant —
  // judged by the final value and what the field shows, not by `toContain`.
  describe("the drawn +380 never leaks into the value", () => {
    function Controlled({
      initial = "",
      onEmit,
    }: {
      initial?: string;
      onEmit?: (value: string) => void;
    }) {
      const [value, setValue] = React.useState(initial);
      return (
        <>
          <PhoneInput
            aria-label="phone"
            value={value}
            onChange={(next) => {
              onEmit?.(next);
              setValue(next);
            }}
          />
          <output aria-label="value">{value}</output>
        </>
      );
    }

    const valueOf = () => screen.getByLabelText("value").textContent ?? "";

    it.each([
      ["0501112233"],
      ["+380501112233"],
      ["050-111-22-33"],
      ["38 050 111 2233"],
      ["+38 (050) 111-22-33"],
    ])(
      "pasting %p at the caret of an empty field gives a valid number",
      async (pasted) => {
        const user = userEvent.setup();
        render(<Controlled />);

        const input = screen.getByLabelText("phone");
        await user.click(input);
        await user.paste(pasted);

        expect(input).toHaveValue("+380 50 111 2233");
        expect(isValidUAPhone(valueOf())).toBe(true);
      },
    );

    it("pasting a whole number over a filled field replaces it", async () => {
      const user = userEvent.setup();
      render(<Controlled initial="+380671234567" />);

      const input = screen.getByLabelText("phone");
      await user.click(input);
      await user.paste("0501112233");

      expect(input).toHaveValue("+380 50 111 2233");
      expect(isValidUAPhone(valueOf())).toBe(true);
    });

    it("typing a domestic number after the drawn +380 gives a valid number", async () => {
      const user = userEvent.setup();
      render(<Controlled />);

      const input = screen.getByLabelText("phone");
      await user.type(input, "0501112233");

      expect(input).toHaveValue("+380 50 111 2233");
      expect(isValidUAPhone(valueOf())).toBe(true);
    });

    it("erasing with Backspace empties the value", async () => {
      const user = userEvent.setup();
      render(<Controlled initial="+380501112233" />);

      const input = screen.getByLabelText("phone");
      await user.click(input);
      await user.keyboard("{Backspace>20/}");

      expect(valueOf()).toBe("");
      expect(input).toHaveValue("+380");
    });

    it("shows a 10th digit instead of hiding it behind a valid-looking mask", async () => {
      const user = userEvent.setup();
      render(<Controlled initial="+380501112233" />);

      const input = screen.getByLabelText("phone");
      await user.click(input);
      await user.keyboard("4");

      expect(isValidUAPhone(valueOf())).toBe(false);
      expect(input).toHaveValue("+380 50 111 22334");
    });
  });
});
