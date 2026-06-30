import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { ReviewEntity, ReviewAggregateEntity } from "@/entities/review";
import { ProductReviewsWidget } from "./product-reviews-widget";

const PRODUCT_ID = "product-1";

function makeReview(overrides: Partial<ReviewEntity> = {}): ReviewEntity {
  return {
    id: "review-1",
    userId: "user-1",
    productId: PRODUCT_ID,
    rating: 5,
    comment: "Чудовий чохол!",
    verifiedPurchase: false,
    isActive: true,
    createdAt:
      "2026-06-01T00:00:00.000Z" as unknown as ReviewEntity["createdAt"],
    ...overrides,
  };
}

function reviewsResponse(
  reviews: ReviewEntity[],
  aggregate: ReviewAggregateEntity,
) {
  return {
    data: reviews,
    aggregate,
    meta: {
      total: reviews.length,
      page: 1,
      limit: 10,
      totalPages: 1,
    },
  };
}

describe("ProductReviewsWidget", () => {
  it("renders the aggregate strip and the review count", async () => {
    server.use(
      http.get("*/api/products/:productId/reviews", () =>
        HttpResponse.json(
          reviewsResponse([makeReview(), makeReview({ id: "review-2" })], {
            ratingAverage: 4.5,
            ratingCount: 2,
          }),
        ),
      ),
    );

    renderWithProviders(<ProductReviewsWidget productId={PRODUCT_ID} />);

    expect(
      await screen.findByText(dict.reviews.ratingCount(2)),
    ).toBeInTheDocument();
  });

  it("shows the verified-purchase badge when a review is verified", async () => {
    server.use(
      http.get("*/api/products/:productId/reviews", () =>
        HttpResponse.json(
          reviewsResponse([makeReview({ verifiedPurchase: true })], {
            ratingAverage: 5,
            ratingCount: 1,
          }),
        ),
      ),
    );

    renderWithProviders(<ProductReviewsWidget productId={PRODUCT_ID} />);

    expect(
      await screen.findByText(dict.reviews.verifiedPurchase),
    ).toBeInTheDocument();
  });

  it("renders the empty state when there are no approved reviews", async () => {
    server.use(
      http.get("*/api/products/:productId/reviews", () =>
        HttpResponse.json(
          reviewsResponse([], { ratingAverage: null, ratingCount: 0 }),
        ),
      ),
    );

    renderWithProviders(<ProductReviewsWidget productId={PRODUCT_ID} />);

    expect(await screen.findByText(dict.reviews.empty)).toBeInTheDocument();
  });
});
