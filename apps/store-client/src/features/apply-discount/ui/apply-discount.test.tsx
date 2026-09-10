import { http, HttpResponse } from "msw";
import * as Sentry from "@sentry/nextjs";
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

const addBreadcrumb = Sentry.addBreadcrumb as jest.Mock;

/** A signed-in shopper — the promo endpoint is behind JwtAuthGuard. */
const authed = {
  auth: { isAuthenticated: true, accessToken: "token" },
} as const;

/** Answer the preview endpoint with the API's own error envelope. */
function previewFails(
  status: number,
  body: { error?: string; message?: string } = {},
) {
  server.use(
    http.post("*/api/cart/discount/preview", () =>
      HttpResponse.json({ statusCode: status, ...body }, { status }),
    ),
  );
}

/** Type a code and press "Застосувати". */
async function applyCode(
  user: ReturnType<typeof userEvent.setup>,
  code: string,
) {
  await user.type(screen.getByLabelText(dict.discounts.inputAria), code);
  await user.click(screen.getByRole("button", { name: dict.discounts.apply }));
}

describe("ApplyDiscount", () => {
  beforeEach(() => {
    clearAppliedDiscount();
    window.sessionStorage.clear();
    addBreadcrumb.mockClear();
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

  // ─── Failure branches (TASK-402) ───────────────────────────────────────────
  // The 2026-08-27 demo run reported "WELCOME10 не працює" while signed out.
  // The code was fine; the shopper had no account, and every one of these very
  // different failures rendered the same sentence.

  describe("failure branches (TASK-402)", () => {
    it("tells a signed-out shopper to sign in on a 401, with a link back to the cart", async () => {
      previewFails(401, { error: "Unauthorized", message: "Unauthorized" });
      const user = userEvent.setup();
      renderWithProviders(<ApplyDiscount />);

      await applyCode(user, "WELCOME10");

      expect(
        await screen.findByText(dict.discounts.errors.unauthorized, {
          exact: false,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: dict.discounts.signInCta }),
      ).toHaveAttribute("href", "/login?redirect=%2Fcart");
    });

    it("sends the sign-in link back to the page the control is on", async () => {
      previewFails(401, { error: "Unauthorized" });
      const user = userEvent.setup();
      renderWithProviders(<ApplyDiscount redirectTo="/checkout" />);

      await applyCode(user, "WELCOME10");

      await waitFor(() =>
        expect(
          screen.getByRole("link", { name: dict.discounts.signInCta }),
        ).toHaveAttribute("href", "/login?redirect=%2Fcheckout"),
      );
    });

    it("names the stale-session cause on a 403 (CSRF)", async () => {
      previewFails(403, { error: "Forbidden", message: "invalid csrf token" });
      const user = userEvent.setup();
      renderWithProviders(<ApplyDiscount />, authed);

      await applyCode(user, "WELCOME10");

      expect(
        await screen.findByText(dict.discounts.errors.forbidden),
      ).toBeInTheDocument();
    });

    it("asks the shopper to wait on a 429 instead of blaming the code", async () => {
      previewFails(429, { message: "ThrottlerException: Too Many Requests" });
      const user = userEvent.setup();
      renderWithProviders(<ApplyDiscount />, authed);

      await applyCode(user, "WELCOME10");

      expect(
        await screen.findByText(dict.discounts.errors.tooManyRequests),
      ).toBeInTheDocument();
    });

    it("shows the API's own sentence for an unmapped 4xx code", async () => {
      previewFails(400, {
        error: "DISCOUNT_UNKNOWN_FUTURE_CODE",
        message: "Цей промокод не діє для товарів зі знижкою.",
      });
      const user = userEvent.setup();
      renderWithProviders(<ApplyDiscount />, authed);

      await applyCode(user, "WELCOME10");

      expect(
        await screen.findByText("Цей промокод не діє для товарів зі знижкою."),
      ).toBeInTheDocument();
    });

    it("never renders a 5xx body — infrastructure English is not shopper copy", async () => {
      previewFails(500, {
        error: "InternalServerErrorException",
        message: "Internal server error",
      });
      const user = userEvent.setup();
      renderWithProviders(<ApplyDiscount />, authed);

      await applyCode(user, "WELCOME10");

      expect(
        await screen.findByText(dict.discounts.errors.generic),
      ).toBeInTheDocument();
      expect(screen.queryByText("Internal server error")).toBeNull();
    });

    it("records the status in a Sentry breadcrumb", async () => {
      previewFails(401, { error: "Unauthorized" });
      const user = userEvent.setup();
      renderWithProviders(<ApplyDiscount />);

      await applyCode(user, "WELCOME10");
      await screen.findByText(dict.discounts.errors.unauthorized, {
        exact: false,
      });

      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "discount.preview.failed",
          data: expect.objectContaining({ statusCode: 401 }),
        }),
      );
    });

    it("clears the previous verdict as soon as the code is edited", async () => {
      previewFails(400, { error: "DISCOUNT_EXPIRED", message: "expired" });
      const user = userEvent.setup();
      renderWithProviders(<ApplyDiscount />, authed);

      await applyCode(user, "OLD");
      await screen.findByText(dict.discounts.errors.DISCOUNT_EXPIRED);

      await user.type(screen.getByLabelText(dict.discounts.inputAria), "X");

      await waitFor(() =>
        expect(
          screen.queryByText(dict.discounts.errors.DISCOUNT_EXPIRED),
        ).toBeNull(),
      );
    });
  });

  describe("guest hint (TASK-402)", () => {
    it("warns a guest that promo codes need an account, before they spend one", () => {
      renderWithProviders(<ApplyDiscount />);

      expect(screen.getByText(dict.discounts.guestHint)).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: dict.discounts.signInCta }),
      ).toHaveAttribute("href", "/login?redirect=%2Fcart");
    });

    it("says nothing of the sort to a signed-in shopper", () => {
      renderWithProviders(<ApplyDiscount />, authed);

      expect(screen.queryByText(dict.discounts.guestHint)).toBeNull();
    });

    it("stays quiet while the session is still resolving", () => {
      renderWithProviders(<ApplyDiscount />, {
        auth: { isInitializing: true },
      });

      expect(screen.queryByText(dict.discounts.guestHint)).toBeNull();
    });
  });
});
