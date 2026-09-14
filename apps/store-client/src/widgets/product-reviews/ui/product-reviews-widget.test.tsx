// The widget reads `?reviewPage` since TASK-446, so it needs `useSearchParams`
// / `usePathname` — neither exists under jsdom. `mockSearch` is the query string
// the component sees; set it in a test to simulate landing on a deep page.
let mockSearch = "";

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mockSearch),
  usePathname: () => "/products/chohol-dlya-iphone-15",
}));

import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type {
  ReviewEntity,
  ReviewAggregateEntity,
  ReviewPaginationMeta,
} from "@/entities/review";
import { ProductReviewsWidget } from "./product-reviews-widget";

const PRODUCT_ID = "product-1";

beforeEach(() => {
  mockSearch = "";
});

function makeReview(overrides: Partial<ReviewEntity> = {}): ReviewEntity {
  return {
    id: "review-1",
    userId: "user-1",
    productId: PRODUCT_ID,
    rating: 5,
    comment: "Чудовий чохол!",
    verifiedPurchase: false,
    reply: null,
    createdAt:
      "2026-06-01T00:00:00.000Z" as unknown as ReviewEntity["createdAt"],
    ...overrides,
  };
}

function reviewsResponse(
  reviews: ReviewEntity[],
  aggregate: ReviewAggregateEntity,
  meta: Partial<ReviewPaginationMeta> = {},
) {
  return {
    data: reviews,
    aggregate,
    meta: {
      total: reviews.length,
      page: 1,
      limit: 10,
      totalPages: 1,
      ...meta,
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

// TASK-446 / owner's decision 6. The widget used to hardcode `{page: 1, limit:
// 10}` and throw `meta` away, so review 11 onwards was simply unreachable — the
// exact gap the owner cited. The page lives in `?reviewPage` rather than local
// state so it composes with the `?tab=reviews` the tabs already own and a deep
// page stays a shareable link.
describe("ProductReviewsWidget — pagination (TASK-446)", () => {
  it("renders the pager and addresses the next page through ?reviewPage", async () => {
    server.use(
      http.get("*/api/products/:productId/reviews", () =>
        HttpResponse.json(
          reviewsResponse(
            [makeReview()],
            { ratingAverage: 4.4, ratingCount: 25 },
            { total: 25, page: 1, totalPages: 3 },
          ),
        ),
      ),
    );

    renderWithProviders(<ProductReviewsWidget productId={PRODUCT_ID} />);

    const pager = await screen.findByRole("navigation", {
      name: dict.catalog.paginationAria,
    });
    expect(within(pager).getByRole("link", { name: "2" })).toHaveAttribute(
      "href",
      "/products/chohol-dlya-iphone-15?reviewPage=2",
    );
  });

  it("keeps the open tab in the href so paging does not close the reviews tab", async () => {
    mockSearch = "tab=reviews";
    server.use(
      http.get("*/api/products/:productId/reviews", () =>
        HttpResponse.json(
          reviewsResponse(
            [makeReview()],
            { ratingAverage: 4.4, ratingCount: 25 },
            { total: 25, page: 1, totalPages: 3 },
          ),
        ),
      ),
    );

    renderWithProviders(<ProductReviewsWidget productId={PRODUCT_ID} />);

    const pager = await screen.findByRole("navigation", {
      name: dict.catalog.paginationAria,
    });
    expect(within(pager).getByRole("link", { name: "2" })).toHaveAttribute(
      "href",
      "/products/chohol-dlya-iphone-15?tab=reviews&reviewPage=2",
    );
  });

  it("asks the API for the page named in ?reviewPage", async () => {
    mockSearch = "tab=reviews&reviewPage=2";
    let requestedPage: string | null = null;
    server.use(
      http.get("*/api/products/:productId/reviews", ({ request }) => {
        requestedPage = new URL(request.url).searchParams.get("page");
        return HttpResponse.json(
          reviewsResponse(
            [makeReview({ id: "review-11", comment: "Одинадцятий" })],
            { ratingAverage: 4.4, ratingCount: 25 },
            { total: 25, page: 2, totalPages: 3 },
          ),
        );
      }),
    );

    renderWithProviders(<ProductReviewsWidget productId={PRODUCT_ID} />);

    expect(await screen.findByText("Одинадцятий")).toBeInTheDocument();
    await waitFor(() => expect(requestedPage).toBe("2"));
  });

  it("hides the pager when everything fits on one page", async () => {
    server.use(
      http.get("*/api/products/:productId/reviews", () =>
        HttpResponse.json(
          reviewsResponse([makeReview()], {
            ratingAverage: 5,
            ratingCount: 1,
          }),
        ),
      ),
    );

    renderWithProviders(<ProductReviewsWidget productId={PRODUCT_ID} />);

    expect(await screen.findByText("Чудовий чохол!")).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: dict.catalog.paginationAria }),
    ).not.toBeInTheDocument();
  });
});

// TASK-446. The shop's answer is not a second review: it must read as a reply to
// the one above it, and it carries no author identity on purpose.
describe("ProductReviewsWidget — the shop's reply (TASK-446)", () => {
  it("renders the shop's answer nested inside the review it answers", async () => {
    server.use(
      http.get("*/api/products/:productId/reviews", () =>
        HttpResponse.json(
          reviewsResponse(
            [
              makeReview({
                reply: {
                  body: "Дякуємо за відгук! Раді, що чохол підійшов.",
                  createdAt: "2026-06-03T00:00:00.000Z",
                },
              }),
            ],
            { ratingAverage: 5, ratingCount: 1 },
          ),
        ),
      ),
    );

    renderWithProviders(<ProductReviewsWidget productId={PRODUCT_ID} />);

    const reply = await screen.findByRole("group", {
      name: dict.reviews.shopReply,
    });
    expect(
      within(reply).getByText("Дякуємо за відгук! Раді, що чохол підійшов."),
    ).toBeInTheDocument();
    // Nested, not a sibling: the reply lives inside the same list item as the
    // review body, so assistive tech reads it as an answer rather than as a
    // second review.
    expect(reply.closest("li")).toContainElement(
      screen.getByText("Чудовий чохол!"),
    );
  });

  it("renders no reply block for a review the shop has not answered", async () => {
    server.use(
      http.get("*/api/products/:productId/reviews", () =>
        HttpResponse.json(
          reviewsResponse([makeReview({ reply: null })], {
            ratingAverage: 5,
            ratingCount: 1,
          }),
        ),
      ),
    );

    renderWithProviders(<ProductReviewsWidget productId={PRODUCT_ID} />);

    expect(await screen.findByText("Чудовий чохол!")).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: dict.reviews.shopReply }),
    ).not.toBeInTheDocument();
  });
});
