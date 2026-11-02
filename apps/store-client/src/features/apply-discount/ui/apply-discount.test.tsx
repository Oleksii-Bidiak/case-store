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
import { clearAppliedDiscount } from "@/entities/discount";

const addBreadcrumb = Sentry.addBreadcrumb as jest.Mock;

/** A signed-in shopper. */
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
  // different failures rendered the same sentence. (TASK-2010 took the 401
  // branch away: a guest's preview now succeeds.)

  describe("failure branches (TASK-402)", () => {
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
      previewFails(400, { error: "DISCOUNT_EXPIRED" });
      const user = userEvent.setup();
      renderWithProviders(<ApplyDiscount />, authed);

      await applyCode(user, "WELCOME10");
      await screen.findByText(dict.discounts.errors.DISCOUNT_EXPIRED);

      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "discount.preview.failed",
          data: expect.objectContaining({
            statusCode: 400,
            errorCode: "DISCOUNT_EXPIRED",
          }),
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

  // ─── A guest's code (TASK-2010) ────────────────────────────────────────────
  // The preview no longer needs a session: the server prices the cart cookie and
  // says the code holds only with an account — which checkout then creates.
  describe("a guest (TASK-2010)", () => {
    function previewForGuest() {
      server.use(
        http.post("*/api/cart/discount/preview", () =>
          HttpResponse.json({
            data: {
              code: "WELCOME10",
              type: "PERCENT",
              amount: "49.90",
              newTotal: "449.10",
              requiresAccount: true,
            },
          }),
        ),
      );
    }

    it("applies a code and says it holds with the account checkout creates", async () => {
      previewForGuest();
      const user = userEvent.setup();
      renderWithProviders(<ApplyDiscount />);

      await applyCode(user, "welcome10");

      expect(
        await screen.findByText(dict.discounts.appliedLabel("WELCOME10")),
      ).toBeInTheDocument();
      expect(
        screen.getByText(dict.discounts.requiresAccountNote),
      ).toBeInTheDocument();
    });

    it("no longer tells a guest to sign in before trying a code", () => {
      renderWithProviders(<ApplyDiscount />);

      expect(screen.queryByText(dict.discounts.guestHint)).toBeNull();
      expect(
        screen.queryByRole("link", { name: dict.discounts.signInCta }),
      ).toBeNull();
    });

    it("keeps the note away from a signed-in shopper", async () => {
      previewForGuest();
      const user = userEvent.setup();
      renderWithProviders(<ApplyDiscount />, authed);

      await applyCode(user, "welcome10");

      await screen.findByText(dict.discounts.appliedLabel("WELCOME10"));
      expect(screen.queryByText(dict.discounts.requiresAccountNote)).toBeNull();
    });

    it("still asks a guest to wait on a 429 (6 a minute)", async () => {
      previewFails(429, { message: "ThrottlerException: Too Many Requests" });
      const user = userEvent.setup();
      renderWithProviders(<ApplyDiscount />);

      await applyCode(user, "WELCOME10");

      expect(
        await screen.findByText(dict.discounts.errors.tooManyRequests),
      ).toBeInTheDocument();
    });
  });
});
