import { renderWithProviders, screen } from "@/shared/test/render";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { PERM } from "@/entities/permission";
import { ReviewHiddenReason } from "@/entities/review";
import { dict } from "@/shared/config";
import { ReviewAuthorModerationAction } from "./review-author-moderation-action";

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
