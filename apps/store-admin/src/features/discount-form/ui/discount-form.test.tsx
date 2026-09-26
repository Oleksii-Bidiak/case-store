import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import { DiscountForm } from "./discount-form";
import {
  discountFormValuesToDto,
  type DiscountFormValues,
} from "../model/discount-schema";

async function submitForm() {
  await userEvent.click(
    screen.getByRole("button", { name: dict.discountForm.submit }),
  );
}

describe("DiscountForm", () => {
  it("submits a valid percent discount with parsed values", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(
      screen.getByLabelText(dict.discountForm.code),
      "summer10",
    );
    await userEvent.type(screen.getByLabelText(dict.discountForm.value), "10");
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SUMMER10", type: "PERCENT", value: 10 }),
      expect.anything(),
    );
  });

  it("rejects a percent value above 100", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(screen.getByLabelText(dict.discountForm.code), "BIG");
    await userEvent.type(screen.getByLabelText(dict.discountForm.value), "150");
    await submitForm();

    expect(
      await screen.findByText(dict.discountForm.errors.percentRange),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requires a code", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(screen.getByLabelText(dict.discountForm.value), "10");
    await submitForm();

    expect(
      await screen.findByText(dict.discountForm.errors.codeRequired),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("re-seeds fields from defaultValues on mount (edit mode)", async () => {
    renderWithProviders(
      <DiscountForm
        id="d-1"
        defaultValues={{ code: "WELCOME", type: "FIXED", value: "50" }}
        onSubmit={jest.fn()}
        isPending={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(dict.discountForm.code)).toHaveValue(
        "WELCOME",
      ),
    );
    expect(screen.getByLabelText(dict.discountForm.value)).toHaveValue(50);
  });

  // TASK-731 (рішення B-11): a new code is private until published.
  it("leaves «Показувати на сторінці «Акції»» off for a new code", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    const box = screen.getByLabelText(dict.discountForm.showOnPromoPage);
    expect(box).not.toBeChecked();

    await userEvent.type(screen.getByLabelText(dict.discountForm.code), "vip");
    await userEvent.type(screen.getByLabelText(dict.discountForm.value), "5");
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ showOnPromoPage: false });
  });

  it("submits showOnPromoPage: true once the operator ticks the box", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(screen.getByLabelText(dict.discountForm.code), "pub");
    await userEvent.type(screen.getByLabelText(dict.discountForm.value), "5");
    await userEvent.click(
      screen.getByLabelText(dict.discountForm.showOnPromoPage),
    );
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ showOnPromoPage: true });
  });

  it("re-seeds the published flag from defaultValues (edit mode)", async () => {
    renderWithProviders(
      <DiscountForm
        id="d-1"
        defaultValues={{ code: "PUB", value: "5", showOnPromoPage: true }}
        onSubmit={jest.fn()}
        isPending={false}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByLabelText(dict.discountForm.showOnPromoPage),
      ).toBeChecked(),
    );
  });
});

describe("discountFormValuesToDto", () => {
  const base: DiscountFormValues = {
    code: "SUMMER10",
    type: "PERCENT",
    value: 10,
    minSpend: undefined,
    maxRedemptions: undefined,
    perUserLimit: undefined,
    startsAt: undefined,
    expiresAt: undefined,
    isActive: true,
  };

  it("CREATE: omits blank optional fields (undefined)", () => {
    const dto = discountFormValuesToDto(base);
    expect(dto.minSpend).toBeUndefined();
    expect(dto.maxRedemptions).toBeUndefined();
    expect(dto.startsAt).toBeUndefined();
  });

  it("UPDATE: clears blank optional fields (null)", () => {
    const dto = discountFormValuesToDto(base, { isUpdate: true });
    expect(dto.minSpend).toBeNull();
    expect(dto.maxRedemptions).toBeNull();
    expect(dto.startsAt).toBeNull();
  });

  it("forwards showOnPromoPage on create and update (TASK-731)", () => {
    const values = { ...base, showOnPromoPage: true };
    expect(discountFormValuesToDto(values).showOnPromoPage).toBe(true);
    expect(
      discountFormValuesToDto(values, { isUpdate: true }).showOnPromoPage,
    ).toBe(true);
  });

  // TASK-795: the old assertion here was `new Date("2026-09-01").toISOString()`
  // — UTC midnight, 03:00 Kyiv — i.e. the test pinned the bug.
  it("sends «Діє до 1 вересня» as the end of that day in Kyiv", () => {
    const dto = discountFormValuesToDto({ ...base, expiresAt: "2026-09-01" });
    expect(dto.expiresAt).toBe("2026-09-01T20:59:59.999Z");
  });

  it("sends the start day as 00:00 in Kyiv", () => {
    const dto = discountFormValuesToDto({ ...base, startsAt: "2026-09-01" });
    expect(dto.startsAt).toBe("2026-08-31T21:00:00.000Z");
  });

  it("keeps both bounds on the wall clock across a DST switch", () => {
    // 25 October 2026: Kyiv falls back from UTC+3 to UTC+2 at 04:00, so the
    // day starts at +3 and ends at +2 — a hard-coded offset gets one of them wrong.
    const dto = discountFormValuesToDto(
      { ...base, startsAt: "2026-10-25", expiresAt: "2026-10-25" },
      { isUpdate: true },
    );
    expect(dto.startsAt).toBe("2026-10-24T21:00:00.000Z");
    expect(dto.expiresAt).toBe("2026-10-25T21:59:59.999Z");
  });

  it("accepts a one-day window (start day = end day)", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(screen.getByLabelText(dict.discountForm.code), "day");
    await userEvent.type(screen.getByLabelText(dict.discountForm.value), "5");
    await userEvent.type(
      screen.getByLabelText(dict.discountForm.startsAt, { exact: false }),
      "2026-09-01",
    );
    await userEvent.type(
      screen.getByLabelText(dict.discountForm.expiresAt, { exact: false }),
      "2026-09-01",
    );
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });
});
