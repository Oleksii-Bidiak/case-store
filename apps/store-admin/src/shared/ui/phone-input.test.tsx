import { createRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneInput } from "./phone-input";

/**
 * Ported from `apps/store-client/src/shared/ui/phone-input.test.tsx` alongside the
 * component (TASK-426). `formatUAPhone` lives in `shared/lib/phone.ts` next to the
 * validation rule; its cases are in `shared/lib/phone.test.ts`.
 */
describe("PhoneInput rule=ua", () => {
  it("renders the +380 prefix for an empty value", () => {
    render(
      <PhoneInput rule="ua" aria-label="phone" value="" onChange={() => {}} />,
    );

    expect(screen.getByLabelText("phone")).toHaveValue("+380");
  });

  it("formats a domestic number on render", () => {
    render(
      <PhoneInput
        rule="ua"
        aria-label="phone"
        value="0501234567"
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("phone")).toHaveValue("+380 50 123 4567");
  });

  it("formats a number with the country code and + on render", () => {
    render(
      <PhoneInput
        rule="ua"
        aria-label="phone"
        value="+380501234567"
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("phone")).toHaveValue("+380 50 123 4567");
  });

  it("preserves a partial value as-is", () => {
    render(
      <PhoneInput
        rule="ua"
        aria-label="phone"
        value="+380 50"
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("phone")).toHaveValue("+380 50");
  });

  it("sets type=tel and inputMode=numeric for the right keyboard", () => {
    render(
      <PhoneInput rule="ua" aria-label="phone" value="" onChange={() => {}} />,
    );

    const input = screen.getByLabelText("phone");
    expect(input).toHaveAttribute("type", "tel");
    expect(input).toHaveAttribute("inputmode", "numeric");
  });

  it("passes aria-invalid through to the input", () => {
    render(
      <PhoneInput
        rule="ua"
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
    render(
      <PhoneInput rule="ua" aria-label="phone" value="" onChange={onChange} />,
    );

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
      <PhoneInput
        rule="ua"
        ref={ref}
        aria-label="phone"
        value=""
        onChange={() => {}}
      />,
    );

    expect(ref.current).toBe(screen.getByLabelText("phone"));
  });
});

// TASK-1984 (Rule 5b): both rules emit the SANITISED raw string — characters
// outside the PHONE_SHAPE alphabet never reach the form, and nothing is cut.
function Controlled({
  rule,
  onEmit,
}: {
  rule: "ua" | "international";
  onEmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <PhoneInput
      rule={rule}
      aria-label="phone"
      value={value}
      onChange={(next) => {
        onEmit(next);
        setValue(next);
      }}
    />
  );
}

const LETTER = /[a-zа-яіїєґ]/i;

describe.each(["ua", "international"] as const)(
  "PhoneInput rule=%s drops characters outside the phone alphabet",
  (rule) => {
    it("emits no letters when a number with letters is pasted", async () => {
      const onEmit = jest.fn();
      const user = userEvent.setup();
      render(<Controlled rule={rule} onEmit={onEmit} />);

      const input = screen.getByLabelText("phone");
      await user.clear(input);
      await user.paste("050 111 2233 ccc");

      const emitted = onEmit.mock.calls.map(([value]) => value as string);
      expect(emitted.length).toBeGreaterThan(0);
      expect(emitted.every((value) => !LETTER.test(value))).toBe(true);
      expect(emitted.at(-1)).toContain("050 111 2233");
    });

    it("emits no letters when they are typed", async () => {
      const onEmit = jest.fn();
      const user = userEvent.setup();
      render(<Controlled rule={rule} onEmit={onEmit} />);

      await user.type(screen.getByLabelText("phone"), "222фіфів");

      const emitted = onEmit.mock.calls.map(([value]) => value as string);
      expect(emitted.every((value) => !LETTER.test(value))).toBe(true);
    });
  },
);

describe("PhoneInput rule=international", () => {
  it("draws no mask — a foreign number is shown exactly as typed", () => {
    render(
      <PhoneInput
        rule="international"
        aria-label="phone"
        value="+48 123 456 789"
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("phone")).toHaveValue("+48 123 456 789");
  });

  it("renders an empty value as empty, not as +380", () => {
    render(
      <PhoneInput
        rule="international"
        aria-label="phone"
        value=""
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("phone")).toHaveValue("");
  });

  it("keeps digits, spaces and + ( ) . - untouched and never truncates", () => {
    const onChange = jest.fn();
    render(
      <PhoneInput
        rule="international"
        aria-label="phone"
        value=""
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("phone"), {
      target: { value: "+1 (212) 555-01.23 4455" },
    });

    expect(onChange).toHaveBeenCalledWith("+1 (212) 555-01.23 4455");
  });

  it("uses type=tel for the phone keyboard", () => {
    render(
      <PhoneInput
        rule="international"
        aria-label="phone"
        value=""
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("phone")).toHaveAttribute("type", "tel");
  });
});
