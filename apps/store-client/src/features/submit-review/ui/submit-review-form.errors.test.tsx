import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import type { OwnReviewEntity } from "@/entities/review";
import { SubmitReviewForm } from "./submit-review-form";

jest.mock("next/navigation", () => ({ usePathname: () => null }));
jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const toastError = toast.error as jest.Mock;

const PRODUCT_ID = "product-1";

const authedUser = {
  isAuthenticated: true,
  userId: "user-1",
  role: "CUSTOMER",
  accessToken: "token",
};

function serveMine(review: OwnReviewEntity | null) {
  server.use(
    http.get("*/api/products/:productId/reviews/mine", () =>
      HttpResponse.json({ data: review }),
    ),
  );
}

function badRequest(field: string, constraint: string) {
  return HttpResponse.json(
    {
      statusCode: 400,
      message: ["refused"],
      fieldErrors: [{ field, constraint }],
    },
    { status: 400 },
  );
}

async function submitNewReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: dict.reviews.starAria(4) }),
  );
  await user.type(
    screen.getByLabelText(dict.reviews.commentLabel),
    "Гарний чохол",
  );
  await user.click(
    screen.getByRole("button", { name: dict.reviews.submitReview }),
  );
}

/**
 * TASK-1984 (forms Rule 6): a server 400 on the comment lands under the
 * comment; the throttle's 429 has its own copy; a toast only for what no field
 * takes — never in addition to the field.
 */
describe("SubmitReviewForm — where a refusal is said (TASK-1984)", () => {
  beforeEach(() => toastError.mockClear());

  it("puts a 400 on the comment under the comment, with no toast", async () => {
    serveMine(null);
    server.use(
      http.post("*/api/products/:productId/reviews", () =>
        badRequest("comment", "maxLength"),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SubmitReviewForm productId={PRODUCT_ID} />, {
      auth: authedUser,
    });

    await submitNewReview(user);

    const comment = screen.getByLabelText(dict.reviews.commentLabel);
    expect(await screen.findByText(dict.reviews.commentMax)).toHaveAttribute(
      "id",
      "review-comment-error",
    );
    expect(comment).toHaveAttribute("aria-invalid", "true");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("gives the 429 its own sentence", async () => {
    serveMine(null);
    server.use(
      http.post("*/api/products/:productId/reviews", () =>
        HttpResponse.json(
          { statusCode: 429, message: "Too Many Requests" },
          { status: 429 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SubmitReviewForm productId={PRODUCT_ID} />, {
      auth: authedUser,
    });

    await submitNewReview(user);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(dict.reviews.rateLimited),
    );
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("keeps the generic toast for a 500", async () => {
    serveMine(null);
    server.use(
      http.post("*/api/products/:productId/reviews", () =>
        HttpResponse.json({ statusCode: 500 }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SubmitReviewForm productId={PRODUCT_ID} />, {
      auth: authedUser,
    });

    await submitNewReview(user);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(dict.reviews.submitError),
    );
  });

  it("puts a 400 on an edited text under the text field, with no toast", async () => {
    serveMine({
      id: "review-1",
      productId: PRODUCT_ID,
      rating: 5,
      comment: "Дуже добре",
      textStatus: "APPROVED",
      createdAt: "2026-06-01T00:00:00.000Z",
    });
    server.use(
      http.patch("*/api/reviews/:id", () =>
        badRequest("comment", "isNotEmpty"),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SubmitReviewForm productId={PRODUCT_ID} />, {
      auth: authedUser,
    });

    const textarea = await screen.findByDisplayValue("Дуже добре");
    await user.type(textarea, " і досі");
    await user.click(
      screen.getByRole("button", { name: dict.reviews.saveText }),
    );

    expect(await screen.findByText(dict.forms.required)).toHaveAttribute(
      "id",
      "review-comment-error",
    );
    expect(toastError).not.toHaveBeenCalled();
  });
});
