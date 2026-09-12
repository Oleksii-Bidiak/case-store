import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { SubmitReviewForm } from "./submit-review-form";

// `usePathname()` is null outside a Next router, which is exactly the shape the
// component falls back on; the redirect test below swaps in a real path.
let mockPathname: string | null = null;
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

const PRODUCT_ID = "product-1";

const authedUser = {
  isAuthenticated: true,
  userId: "user-1",
  role: "CUSTOMER",
  accessToken: "token",
};

describe("SubmitReviewForm", () => {
  beforeEach(() => {
    mockPathname = null;
  });

  it("shows a login prompt for guests and hides the form", () => {
    renderWithProviders(<SubmitReviewForm productId={PRODUCT_ID} />);

    expect(screen.getByText(dict.reviews.loginToReview)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.reviews.loginLink }),
    ).toHaveAttribute("href", "/login");
    // The rating/submit form must not be visible to guests.
    expect(
      screen.queryByRole("button", { name: dict.reviews.submitReview }),
    ).not.toBeInTheDocument();
  });

  // TASK-419: the prompt used to link to a bare "/login", which dropped the
  // shopper on the homepage after signing in — the review they came to write
  // was several clicks away again, with nothing saying where it went.
  it("sends the guest back to the product page after signing in", () => {
    mockPathname = "/products/chohol-dlya-iphone-15";

    renderWithProviders(<SubmitReviewForm productId={PRODUCT_ID} />);

    expect(
      screen.getByRole("link", { name: dict.reviews.loginLink }),
    ).toHaveAttribute(
      "href",
      "/login?redirect=%2Fproducts%2Fchohol-dlya-iphone-15",
    );
  });

  it("submits the review with the chosen rating for an authenticated user", async () => {
    const user = userEvent.setup();
    let submittedRating: number | null = null;
    server.use(
      http.post("*/api/products/:productId/reviews", async ({ request }) => {
        const body = (await request.json()) as { rating: number };
        submittedRating = body.rating;
        return HttpResponse.json(
          {
            data: {
              id: "review-1",
              userId: "user-1",
              productId: PRODUCT_ID,
              rating: body.rating,
              comment: null,
              verifiedPurchase: false,
              isActive: false,
              createdAt: "2026-06-30T00:00:00.000Z",
            },
          },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<SubmitReviewForm productId={PRODUCT_ID} />, {
      auth: authedUser,
    });

    await user.click(
      screen.getByRole("button", { name: dict.reviews.starAria(4) }),
    );
    await user.click(
      screen.getByRole("button", { name: dict.reviews.submitReview }),
    );

    await waitFor(() => expect(submittedRating).toBe(4));
  });

  it("surfaces the already-reviewed message on a 409 response", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/products/:productId/reviews", () =>
        HttpResponse.json(
          { message: "You have already reviewed this product" },
          { status: 409 },
        ),
      ),
    );

    renderWithProviders(<SubmitReviewForm productId={PRODUCT_ID} />, {
      auth: authedUser,
    });

    await user.click(
      screen.getByRole("button", { name: dict.reviews.starAria(5) }),
    );
    await user.click(
      screen.getByRole("button", { name: dict.reviews.submitReview }),
    );

    expect(
      await screen.findByText(dict.reviews.alreadyReviewed),
    ).toBeInTheDocument();
  });
});
