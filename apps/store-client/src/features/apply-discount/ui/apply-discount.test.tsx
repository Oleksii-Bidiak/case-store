import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ApplyDiscount } from "./apply-discount";
import { clearAppliedDiscount } from "../model/applied-discount-store";

describe("ApplyDiscount", () => {
  beforeEach(() => {
    clearAppliedDiscount();
    window.sessionStorage.clear();
  });

  it("applies a valid promo code and shows the discount", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/cart/discount/preview", () =>
        HttpResponse.json({
          data: {
            code: "SUMMER10",
            type: "PERCENT",
            amount: "20.00",
            newTotal: "180.00",
          },
        }),
      ),
    );

    renderWithProviders(<ApplyDiscount />);

    await user.type(
      screen.getByLabelText(dict.discounts.inputAria),
      "summer10",
    );
    await user.click(
      screen.getByRole("button", { name: dict.discounts.apply }),
    );

    expect(
      await screen.findByText(dict.discounts.appliedLabel("SUMMER10")),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.discounts.discountLine)).toBeInTheDocument();
  });

  it("shows a localized message for a typed error code", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/cart/discount/preview", () =>
        HttpResponse.json(
          { statusCode: 400, error: "DISCOUNT_EXPIRED", message: "expired" },
          { status: 400 },
        ),
      ),
    );

    renderWithProviders(<ApplyDiscount />);

    await user.type(screen.getByLabelText(dict.discounts.inputAria), "OLD");
    await user.click(
      screen.getByRole("button", { name: dict.discounts.apply }),
    );

    expect(
      await screen.findByText(dict.discounts.errors.DISCOUNT_EXPIRED),
    ).toBeInTheDocument();
  });

  it("validates that a code is required before submitting", async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post("*/api/cart/discount/preview", () => {
        called = true;
        return HttpResponse.json({ data: {} });
      }),
    );

    renderWithProviders(<ApplyDiscount />);

    await user.click(
      screen.getByRole("button", { name: dict.discounts.apply }),
    );

    expect(
      await screen.findByText(dict.discounts.required),
    ).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("removes an applied code", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/cart/discount/preview", () =>
        HttpResponse.json({
          data: {
            code: "SUMMER10",
            type: "PERCENT",
            amount: "20.00",
            newTotal: "180.00",
          },
        }),
      ),
    );

    renderWithProviders(<ApplyDiscount />);

    await user.type(
      screen.getByLabelText(dict.discounts.inputAria),
      "SUMMER10",
    );
    await user.click(
      screen.getByRole("button", { name: dict.discounts.apply }),
    );
    await screen.findByText(dict.discounts.appliedLabel("SUMMER10"));

    await user.click(
      screen.getByRole("button", { name: dict.discounts.remove }),
    );

    await waitFor(() =>
      expect(
        screen.getByLabelText(dict.discounts.inputAria),
      ).toBeInTheDocument(),
    );
  });
});
