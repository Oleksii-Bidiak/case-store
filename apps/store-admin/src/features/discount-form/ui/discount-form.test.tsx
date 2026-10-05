import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import { DiscountForm } from "./discount-form";
import {
  discountFormValuesToDto,
  type DiscountFormValues,
} from "../model/discount-schema";

const f = dict.discountForm;

const codeInput = () => screen.getByRole("textbox", { name: f.code });
const valueInput = () => screen.getByRole("spinbutton", { name: f.value });

async function submitForm() {
  await userEvent.click(screen.getByRole("button", { name: f.submit }));
}

describe("DiscountForm", () => {
  it("submits a valid percent discount with parsed values", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(codeInput(), "summer10");
    await userEvent.type(valueInput(), "10");
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

    await userEvent.type(codeInput(), "BIG");
    await userEvent.type(valueInput(), "150");
    await submitForm();

    expect(await screen.findByText(f.errors.percentRange)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ПК4: «0» in the discount is not a discount — said next to the field.
  it("rejects a discount of 0 next to the field, and marks it invalid", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(codeInput(), "zero");
    await userEvent.type(valueInput(), "0");
    await submitForm();

    expect(await screen.findByText(f.errors.valuePositive)).toBeInTheDocument();
    expect(valueInput()).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // TASK-796 / ПК4: the API has @Min(1) on both caps; `0` used to pass the form
  // and come back as a generic "could not create". The words say what 0 means.
  it.each([
    ["maxRedemptions", f.maxRedemptions],
    ["perUserLimit", f.perUserLimit],
  ])("rejects a %s of 0 with the hint under the field", async (_, label) => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(codeInput(), "cap");
    await userEvent.type(valueInput(), "5");
    const cap = screen.getByRole("spinbutton", { name: label });
    await userEvent.type(cap, "0");
    await submitForm();

    expect(await screen.findByText(f.errors.capZero)).toBeInTheDocument();
    expect(cap).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a value with more than two decimals", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(codeInput(), "dec");
    await userEvent.type(valueInput(), "10.555");
    await submitForm();

    expect(await screen.findByText(f.errors.decimalsMax)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("accepts a cap of 1 and a value with two decimals", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(codeInput(), "ok");
    await userEvent.type(valueInput(), "12.5");
    await userEvent.type(
      screen.getByRole("spinbutton", { name: f.perUserLimit }),
      "1",
    );
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      value: 12.5,
      perUserLimit: 1,
    });
  });

  it("requires a code", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(valueInput(), "10");
    await submitForm();

    expect(await screen.findByText(f.errors.codeRequired)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("summarises the refused fields above the form (ПК4)", async () => {
    renderWithProviders(
      <DiscountForm onSubmit={jest.fn()} isPending={false} />,
    );

    await userEvent.type(codeInput(), "x");
    await userEvent.type(valueInput(), "0");
    await userEvent.type(
      screen.getByRole("spinbutton", { name: f.maxRedemptions }),
      "0",
    );
    await submitForm();

    expect(await screen.findByText(f.errorSummary(2))).toBeInTheDocument();
  });

  // ПК4: a reversed window is wrong on BOTH ends — both are marked, the reason
  // is said once.
  it("marks both dates when «Діє до» is before «Діє з»", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(codeInput(), "late");
    await userEvent.type(valueInput(), "5");
    const starts = screen.getByLabelText(f.startsAt);
    const expires = screen.getByLabelText(f.expiresAt);
    await userEvent.type(starts, "2026-10-15");
    await userEvent.type(expires, "2026-10-01");
    await submitForm();

    expect(await screen.findAllByText(f.errors.dateOrder)).toHaveLength(1);
    expect(starts).toHaveAttribute("aria-invalid", "true");
    expect(expires).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("re-seeds fields from defaultValues on mount (edit mode)", async () => {
    renderWithProviders(
      <DiscountForm
        id="d-1"
        defaultValues={{ code: "WELCOME", type: "FIXED", value: "50" }}
        onSubmit={jest.fn()}
        isPending={false}
        lockCode
      />,
    );

    await waitFor(() => expect(codeInput()).toHaveValue("WELCOME"));
    expect(valueInput()).toHaveValue(50);
  });

  // TASK-731 (рішення B-11): a new code is private until published.
  it("leaves «Показувати на сторінці «Акції»» off for a new code", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    const toggle = screen.getByRole("switch", { name: f.showOnPromoPage });
    expect(toggle).not.toBeChecked();

    await userEvent.type(codeInput(), "vip");
    await userEvent.type(valueInput(), "5");
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ showOnPromoPage: false });
  });

  it("submits showOnPromoPage: true once the operator flips the switch", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(codeInput(), "pub");
    await userEvent.type(valueInput(), "5");
    await userEvent.click(
      screen.getByRole("switch", { name: f.showOnPromoPage }),
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
        screen.getByRole("switch", { name: f.showOnPromoPage }),
      ).toBeChecked(),
    );
  });

  it("«Увімкнено» is a switch, on for a new code, and switching it off is sent", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    const active = screen.getByRole("switch", { name: f.active });
    expect(active).toBeChecked();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    await userEvent.type(codeInput(), "off");
    await userEvent.type(valueInput(), "5");
    await userEvent.click(active);
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ isActive: false });
  });
});

describe("DiscountForm — ПК3/ПК4 layout", () => {
  it("is cut into «Код і знижка · Умови · Період · Видимість»", () => {
    renderWithProviders(
      <DiscountForm onSubmit={jest.fn()} isPending={false} />,
    );

    for (const title of [
      f.sectionCode,
      f.sectionConditions,
      f.sectionPeriod,
      f.sectionVisibility,
    ]) {
      expect(screen.getByRole("region", { name: title })).toBeInTheDocument();
    }
  });

  it("says that only a registered customer can apply a code (owner-confirmed)", () => {
    renderWithProviders(
      <DiscountForm onSubmit={jest.fn()} isPending={false} />,
    );

    expect(screen.getByText(f.guestNoticeStrong)).toBeInTheDocument();
  });

  it("«Згенерувати» fills a code a customer can type", async () => {
    renderWithProviders(
      <DiscountForm onSubmit={jest.fn()} isPending={false} />,
    );

    await userEvent.click(screen.getByRole("button", { name: f.generate }));

    expect((codeInput() as HTMLInputElement).value).toMatch(/^[A-Z0-9]{8}$/);
  });

  it("locks the code after creation and says why — no «Згенерувати» then", async () => {
    renderWithProviders(
      <DiscountForm
        id="d-1"
        defaultValues={{ code: "SUMMER500", value: "500", type: "FIXED" }}
        lockCode
        onSubmit={jest.fn()}
        isPending={false}
      />,
    );

    await waitFor(() => expect(codeInput()).toHaveValue("SUMMER500"));
    expect(codeInput()).toBeDisabled();
    expect(screen.getByText(f.codeLockedHint)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: f.generate }),
    ).not.toBeInTheDocument();
  });

  it("switches the type with a segmented control and moves the unit into the field", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<DiscountForm onSubmit={onSubmit} isPending={false} />);

    const group = screen.getByRole("radiogroup", { name: f.type });
    expect(
      within(group).getByRole("radio", { name: f.typePercent }),
    ).toBeChecked();
    expect(screen.getByText(f.unitPercent)).toBeInTheDocument();

    await userEvent.click(
      within(group).getByRole("radio", { name: f.typeFixed }),
    );
    expect(screen.getAllByText(f.unitCurrency).length).toBeGreaterThan(0);

    await userEvent.type(codeInput(), "cash");
    await userEvent.type(valueInput(), "500");
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      type: "FIXED",
      value: 500,
    });
  });

  it("previews the cart line «Як побачить покупець» from the values on screen", async () => {
    renderWithProviders(
      <DiscountForm onSubmit={jest.fn()} isPending={false} />,
    );

    await userEvent.click(screen.getByRole("radio", { name: f.typeFixed }));
    await userEvent.type(codeInput(), "summer500");
    await userEvent.type(valueInput(), "500");
    await userEvent.type(
      screen.getByRole("spinbutton", { name: f.minSpend }),
      "3000",
    );

    const preview = screen.getByRole("region", { name: f.previewTitle });
    expect(within(preview).getByText("SUMMER500")).toBeInTheDocument();
    expect(within(preview).getByText(/^−500\s₴$/)).toBeInTheDocument();
    expect(
      within(preview).getByText(/^Діє для замовлень від 3\s000\s₴$/),
    ).toBeInTheDocument();
  });

  it("view-only: every field disabled, no save", async () => {
    renderWithProviders(
      <DiscountForm
        id="d-1"
        defaultValues={{ code: "SUMMER500", value: "500" }}
        lockCode
        readOnly
        onSubmit={jest.fn()}
        isPending={false}
      />,
    );

    await waitFor(() => expect(codeInput()).toHaveValue("SUMMER500"));
    expect(valueInput()).toBeDisabled();
    expect(screen.getByRole("switch", { name: f.active })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: f.submit }),
    ).not.toBeInTheDocument();
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

    await userEvent.type(codeInput(), "day");
    await userEvent.type(valueInput(), "5");
    await userEvent.type(screen.getByLabelText(f.startsAt), "2026-09-01");
    await userEvent.type(screen.getByLabelText(f.expiresAt), "2026-09-01");
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });
});
