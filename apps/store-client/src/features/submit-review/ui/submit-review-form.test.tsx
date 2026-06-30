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

const PRODUCT_ID = "product-1";

const authedUser = {
  isAuthenticated: true,
  userId: "user-1",
  role: "CUSTOMER",
  accessToken: "token",
};

describe("SubmitReviewForm", () => {
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
