import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { PERM } from "@/entities/permission";
import { ReviewHiddenReason } from "@/entities/review";
import { dict } from "@/shared/config";
import {
  ReviewAuthorModerationAction,
  ReviewAuthorModerationDialog,
  authorModerationMode,
} from "./review-author-moderation-action";

/**
 * TASK-1004 — which author action a row offers is READ from the server's
 * `hiddenReason`, no longer inferred from `ratingVisible` (which folds a
 * moderator's hide and an unconfirmed email into one boolean).
 */
function renderAction(
  hiddenReason: ReviewHiddenReason | null,
  permissions: string[] = [PERM.reviewsModerate],
) {
  return renderWithProviders(
    <WithAuth permissions={permissions}>
      <ReviewAuthorModerationAction
        userId="user-uuid-1"
        author="olena"
        hiddenReason={hiddenReason}
      />
    </WithAuth>,
  );
}

const d = dict.reviews;

describe("ReviewAuthorModerationAction", () => {
  it("offers «приховати» when nothing is withdrawn", () => {
    renderAction(null);

    expect(
      screen.getByRole("button", { name: d.hideAuthorAction }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: d.unhideAuthorAction }),
    ).not.toBeInTheDocument();
  });

  it("offers «повернути» only for a moderator's hide", () => {
    renderAction(ReviewHiddenReason.MODERATOR);

    expect(
      screen.getByRole("button", { name: d.unhideAuthorAction }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: d.hideAuthorAction }),
    ).not.toBeInTheDocument();
  });

  it.each([ReviewHiddenReason.BAN, ReviewHiddenReason.DELETED])(
    "offers nothing while the account itself holds the rows (%s)",
    (reason) => {
      renderAction(reason);

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    },
  );

  it("renders nothing without reviews:moderate", () => {
    renderAction(ReviewHiddenReason.MODERATOR, []);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

/**
 * Wave 198 (TASK-1057, ReviewsProposal В2/В7): the action moved into the row's
 * «⋯» menu as a destructive item, so the dialog has to open from the menu —
 * controlled by the row — and the row has to know, without rendering anything,
 * which of the two items (or neither) to offer.
 */
describe("authorModerationMode", () => {
  it.each([
    [null, "hide"],
    [ReviewHiddenReason.MODERATOR, "restore"],
    [ReviewHiddenReason.BAN, null],
    [ReviewHiddenReason.DELETED, null],
  ] as const)("%s → %s", (reason, mode) => {
    expect(authorModerationMode(reason)).toBe(mode);
  });
});

describe("ReviewAuthorModerationDialog (controlled)", () => {
  it("asks before hiding and sends the hide once confirmed", async () => {
    const user = userEvent.setup();
    let hidden: string | null = null;
    const onOpenChange = jest.fn();
    server.use(
      http.post("*/api/admin/reviews/authors/:userId/hide", ({ params }) => {
        hidden = params.userId as string;
        return HttpResponse.json({ data: { updatedCount: 3 } });
      }),
    );

    renderWithProviders(
      <WithAuth permissions={[PERM.reviewsModerate]}>
        <ReviewAuthorModerationDialog
          userId="user-uuid-1"
          author="olena"
          hiddenReason={null}
          open
          onOpenChange={onOpenChange}
        />
      </WithAuth>,
    );

    expect(await screen.findByText(d.hideAuthorTitle)).toBeInTheDocument();
    expect(screen.getByText(d.hideAuthorDescription("olena"))).toBeVisible();
    expect(hidden).toBeNull();

    await user.click(screen.getByRole("button", { name: d.hideAuthorConfirm }));

    await waitFor(() => expect(hidden).toBe("user-uuid-1"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("speaks of restoring for a moderator's hide", async () => {
    renderWithProviders(
      <WithAuth permissions={[PERM.reviewsModerate]}>
        <ReviewAuthorModerationDialog
          userId="user-uuid-1"
          author="olena"
          hiddenReason={ReviewHiddenReason.MODERATOR}
          open
          onOpenChange={jest.fn()}
        />
      </WithAuth>,
    );

    expect(await screen.findByText(d.unhideAuthorTitle)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: d.unhideAuthorConfirm }),
    ).toBeInTheDocument();
  });

  it("renders nothing without reviews:moderate, even when asked to open", () => {
    renderWithProviders(
      <WithAuth permissions={[]}>
        <ReviewAuthorModerationDialog
          userId="user-uuid-1"
          author="olena"
          hiddenReason={null}
          open
          onOpenChange={jest.fn()}
        />
      </WithAuth>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
