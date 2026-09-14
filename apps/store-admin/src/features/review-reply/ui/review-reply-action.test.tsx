import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { PERM } from "@/entities/permission";
import type { AdminReviewEntity } from "@/entities/review";
import { dict } from "@/shared/config";
import { ReviewReplyAction } from "./review-reply-action";

const d = dict.reviews;

function makeReview(overrides: Partial<AdminReviewEntity> = {}) {
  return {
    id: "review-uuid-1",
    userId: "user-uuid-1",
    productId: "product-uuid-1",
    rating: 2,
    comment: "Прийшов подряпаний.",
    verifiedPurchase: true,
    textStatus: "APPROVED",
    ratingVisible: true,
    reply: null,
    createdAt: "2026-06-01T10:00:00.000Z",
    userEmail: "olena@example.com",
    productName: "iPhone 15 Pro Case",
    productSku: "CASE-IP15P-BLK",
    ...overrides,
  } as AdminReviewEntity;
}

function renderAction(
  review: AdminReviewEntity,
  permissions: string[] = [PERM.reviewsWrite],
) {
  return renderWithProviders(
    <WithAuth isOwner={false} permissions={permissions}>
      <ReviewReplyAction review={review} />
    </WithAuth>,
  );
}

/**
 * TASK-446 — the shop answering a review in public.
 *
 * Gated on `reviews:write`, which is deliberately NOT `reviews:moderate`:
 * deciding what stays on the site and speaking as the shop to every visitor are
 * different jobs, and the backend guards them separately.
 */
describe("ReviewReplyAction (TASK-446)", () => {
  it("renders nothing at all without reviews:write", () => {
    const { container } = renderAction(makeReview(), [PERM.reviewsModerate]);

    // Not a disabled button, not a tooltip — nothing. A control whose only
    // possible outcome is a 403 is worse than an absent one.
    expect(container).toBeEmptyDOMElement();
  });

  it("posts the typed body to the reply endpoint", async () => {
    const user = userEvent.setup();
    let posted: { id: string; body: unknown } | null = null;
    server.use(
      http.post(
        "*/api/admin/reviews/:id/reply",
        async ({ params, request }) => {
          const payload = (await request.json()) as { body: string };
          posted = { id: params.id as string, body: payload.body };
          return HttpResponse.json({
            data: { body: payload.body, createdAt: "2026-06-02T10:00:00.000Z" },
          });
        },
      ),
    );

    renderAction(makeReview());

    await user.click(screen.getByRole("button", { name: d.replyAction }));
    await user.type(
      await screen.findByLabelText(d.replyLabel),
      "Вибачте, надішлемо заміну.",
    );
    await user.click(screen.getByRole("button", { name: d.replySubmit }));

    await waitFor(() =>
      expect(posted).toEqual({
        id: "review-uuid-1",
        body: "Вибачте, надішлемо заміну.",
      }),
    );
  });

  /**
   * The endpoint is an UPSERT — a second POST replaces the first. Seeding the
   * textarea with what is already published makes editing an answer an EDIT
   * instead of retyping it from memory, and the note says the replacement is
   * coming BEFORE the operator commits to it.
   */
  it("seeds the textarea from the existing reply and warns that saving replaces it", async () => {
    const user = userEvent.setup();
    renderAction(
      makeReview({
        reply: {
          body: "Дякуємо за відгук!",
          createdAt: "2026-06-02T10:00:00.000Z",
        },
      }),
    );

    await user.click(screen.getByRole("button", { name: d.replyEditAction }));

    expect(await screen.findByLabelText(d.replyLabel)).toHaveValue(
      "Дякуємо за відгук!",
    );
    expect(screen.getByText(d.replyReplaceNote)).toBeInTheDocument();
  });

  /**
   * forms.md Rule 2a. The review is async server data that refetches under the
   * dialog — every mutation on this screen invalidates the list. Seeding
   * `useState` from the prop, or re-keying the dialog, would throw away a reply
   * half-typed at the moment the refetch lands.
   */
  it("keeps an in-progress answer when the review refetches underneath it", async () => {
    const user = userEvent.setup();
    const review = makeReview();
    const { rerender } = renderAction(review);

    await user.click(screen.getByRole("button", { name: d.replyAction }));
    const textarea = await screen.findByLabelText(d.replyLabel);
    await user.type(textarea, "Пишемо відповідь…");

    // The list refetched: a new object for the same review, with a reply someone
    // else published while this one was being typed.
    rerender(
      <WithAuth isOwner={false} permissions={[PERM.reviewsWrite]}>
        <ReviewReplyAction
          review={makeReview({
            reply: {
              body: "Чужа відповідь",
              createdAt: "2026-06-02T10:00:00.000Z",
            },
          })}
        />
      </WithAuth>,
    );

    expect(screen.getByLabelText(d.replyLabel)).toHaveValue(
      "Пишемо відповідь…",
    );
  });

  /**
   * TASK-598 — the other half of Rule 2a, and the dangerous half.
   *
   * `keepDirtyValues` holds a dirty field against every later `values`, and
   * closing the dialog unmounts the textarea without clearing that flag. So an
   * abandoned draft was held for the life of the row, while the button label and
   * the "saving will replace it" line went on reading the SERVER value — the UI
   * said "there is a published answer and saving replaces it" over a box showing
   * something else entirely.
   */
  it("drops an abandoned draft, so it cannot overwrite an answer published meanwhile", async () => {
    const user = userEvent.setup();
    const { rerender } = renderAction(makeReview());

    // Types an answer, thinks better of it, closes the dialog without saving.
    await user.click(screen.getByRole("button", { name: d.replyAction }));
    await user.type(
      await screen.findByLabelText(d.replyLabel),
      "Чернетка, яку передумали",
    );
    await user.click(screen.getByRole("button", { name: dict.common.cancel }));

    // Meanwhile a colleague answers this review; the list refetches.
    rerender(
      <WithAuth isOwner={false} permissions={[PERM.reviewsWrite]}>
        <ReviewReplyAction
          review={makeReview({
            reply: {
              body: "Чужа опублікована відповідь",
              createdAt: "2026-06-02T10:00:00.000Z",
            },
          })}
        />
      </WithAuth>,
    );

    // Reopening must show what is LIVE. Showing the old draft under a label that
    // says "edit the reply" is how a colleague's words get overwritten unseen.
    await user.click(screen.getByRole("button", { name: d.replyEditAction }));

    expect(await screen.findByLabelText(d.replyLabel)).toHaveValue(
      "Чужа опублікована відповідь",
    );
  });

  it("refuses to submit an empty answer", async () => {
    const user = userEvent.setup();
    let posted = false;
    server.use(
      http.post("*/api/admin/reviews/:id/reply", () => {
        posted = true;
        return HttpResponse.json({
          data: { body: "", createdAt: "2026-06-02T10:00:00.000Z" },
        });
      }),
    );

    renderAction(makeReview());

    await user.click(screen.getByRole("button", { name: d.replyAction }));
    await screen.findByLabelText(d.replyLabel);
    await user.click(screen.getByRole("button", { name: d.replySubmit }));

    // The DTO's `@MinLength(1)` would reject it anyway; the point is not to
    // spend a round trip discovering that, and not to publish an empty answer.
    await waitFor(() => expect(posted).toBe(false));
  });
});
