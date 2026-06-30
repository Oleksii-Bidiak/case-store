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

  it("widens a date-only string to an ISO datetime", () => {
    const dto = discountFormValuesToDto({ ...base, expiresAt: "2026-09-01" });
    expect(dto.expiresAt).toBe(new Date("2026-09-01").toISOString());
  });
});
