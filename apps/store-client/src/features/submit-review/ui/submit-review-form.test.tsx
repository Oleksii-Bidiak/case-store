import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { OwnReviewEntity } from "@/entities/review";
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

/** The caller's own review as `GET …/reviews/mine` returns it. */
function makeOwnReview(
  overrides: Partial<OwnReviewEntity> = {},
): OwnReviewEntity {
  return {
    id: "review-1",
    productId: PRODUCT_ID,
    rating: 5,
    comment: null,
    textStatus: "PENDING",
    createdAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Make `…/reviews/mine` answer with a review (or with nothing). */
function serveMine(review: OwnReviewEntity | null) {
  server.use(
    http.get("*/api/products/:productId/reviews/mine", () =>
      HttpResponse.json({ data: review }),
    ),
  );
}

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
    serveMine(null);
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
              reply: null,
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
      await screen.findByRole("button", { name: dict.reviews.starAria(4) }),
    );
    await user.click(
      screen.getByRole("button", { name: dict.reviews.submitReview }),
    );

    await waitFor(() => expect(submittedRating).toBe(4));
  });

  it("surfaces the already-reviewed message on a 409 response", async () => {
    const user = userEvent.setup();
    serveMine(null);
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
      await screen.findByRole("button", { name: dict.reviews.starAria(5) }),
    );
    await user.click(
      screen.getByRole("button", { name: dict.reviews.submitReview }),
    );

    expect(
      await screen.findByText(dict.reviews.alreadyReviewed),
    ).toBeInTheDocument();
  });
});

// TASK-446 / owner's decision 5. A rating already left used to be a dead end:
// the form only ever POSTed, and the 409 it earned said «Ви вже залишили
// відгук» with no way forward. The author may now add or rewrite the TEXT —
// the rating itself is immutable, so the UI must not offer what the API
// rejects.
describe("SubmitReviewForm — editing the author's own review (TASK-446)", () => {
  beforeEach(() => {
    mockPathname = null;
  });

  it("seeds the textarea from the review the author already left", async () => {
    serveMine(makeOwnReview({ comment: "Дуже добре", textStatus: "APPROVED" }));

    renderWithProviders(<SubmitReviewForm productId={PRODUCT_ID} />, {
      auth: authedUser,
    });

    expect(await screen.findByDisplayValue("Дуже добре")).toBeInTheDocument();
  });

  it("warns that saving re-opens moderation BEFORE the author submits", async () => {
    serveMine(makeOwnReview({ comment: "Дуже добре", textStatus: "APPROVED" }));

    renderWithProviders(<SubmitReviewForm productId={PRODUCT_ID} />, {
      auth: authedUser,
    });

    expect(
      await screen.findByText(dict.reviews.editResetsModeration),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.reviews.textApproved)).toBeInTheDocument();
  });

  it("does not offer to change the rating, and says why", async () => {
    serveMine(
      makeOwnReview({
        rating: 5,
        comment: "Дуже добре",
        textStatus: "APPROVED",
      }),
    );

    renderWithProviders(<SubmitReviewForm productId={PRODUCT_ID} />, {
      auth: authedUser,
    });

    expect(
      await screen.findByText(dict.reviews.ratingLocked),
    ).toBeInTheDocument();
    // No clickable star: the backend refuses a rating change, so the control is
    // gone rather than present-but-inert.
    expect(
      screen.queryByRole("button", { name: dict.reviews.starAria(3) }),
    ).not.toBeInTheDocument();
  });

  it("PATCHes the edited text instead of POSTing a second review", async () => {
    const user = userEvent.setup();
    serveMine(makeOwnReview({ comment: "Дуже добре", textStatus: "APPROVED" }));
    let patched: { id: string; comment: unknown } | null = null;
    server.use(
      http.patch("*/api/reviews/:id", async ({ request, params }) => {
        const body = (await request.json()) as { comment?: string };
        patched = { id: String(params.id), comment: body.comment };
        return HttpResponse.json({
          data: makeOwnReview({
            comment: body.comment ?? null,
            textStatus: "PENDING",
          }),
        });
      }),
    );

    renderWithProviders(<SubmitReviewForm productId={PRODUCT_ID} />, {
      auth: authedUser,
    });

    const textarea = await screen.findByDisplayValue("Дуже добре");
    await user.clear(textarea);
    await user.type(textarea, "Переписав через місяць");
    await user.click(
      screen.getByRole("button", { name: dict.reviews.saveText }),
    );

    await waitFor(() =>
      expect(patched).toEqual({
        id: "review-1",
        comment: "Переписав через місяць",
      }),
    );
  });

  it("says the text is on moderation while it waits", async () => {
    serveMine(makeOwnReview({ comment: "Чекає", textStatus: "PENDING" }));

    renderWithProviders(<SubmitReviewForm productId={PRODUCT_ID} />, {
      auth: authedUser,
    });

    expect(
      await screen.findByText(dict.reviews.textPending),
    ).toBeInTheDocument();
  });

  it("tells the author a rejected text was never published, and invites a rewrite", async () => {
    serveMine(makeOwnReview({ comment: "Відхилено", textStatus: "REJECTED" }));

    renderWithProviders(<SubmitReviewForm productId={PRODUCT_ID} />, {
      auth: authedUser,
    });

    expect(
      await screen.findByText(dict.reviews.textRejected),
    ).toBeInTheDocument();
    // The rejected text stays in the box so the author can rework it rather
    // than retype it from memory.
    expect(screen.getByDisplayValue("Відхилено")).toBeInTheDocument();
  });

  it("invites text on a rating-only review rather than claiming it is on moderation", async () => {
    // A star-only rating is stored PENDING with a null comment — there is no
    // text under review yet, so «текст на модерації» would simply be untrue.
    serveMine(makeOwnReview({ comment: null, textStatus: "PENDING" }));

    renderWithProviders(<SubmitReviewForm productId={PRODUCT_ID} />, {
      auth: authedUser,
    });

    expect(
      await screen.findByText(dict.reviews.addTextHint),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.reviews.textPending),
    ).not.toBeInTheDocument();
  });
});
