import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { countLabel } from "@/shared/lib";
import { dict } from "@/shared/config";
import {
  useReviewBulkModeration,
  type ReviewBulkAction,
} from "./use-review-bulk-moderation";

const t = dict.reviews.bulk;
const IDS = ["review-1", "review-2"];

function Harness({ onSuccess }: { onSuccess?: () => void }) {
  const bulk = useReviewBulkModeration({ onSuccess });
  const run = (action: ReviewBulkAction) => () => bulk.moderate(IDS, action);
  return (
    <>
      <button type="button" onClick={run("approve")}>
        approve
      </button>
      <button type="button" onClick={run("reject")}>
        reject
      </button>
      {bulk.confirmDialog}
    </>
  );
}

function stubModerate() {
  const bodies: unknown[] = [];
  server.use(
    http.patch("*/api/admin/reviews/moderate", async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ data: { updatedCount: IDS.length } });
    }),
  );
  return bodies;
}

/**
 * Wave 198 (TASK-1057, ReviewsProposal В6) — BOTH bulk verdicts ask first.
 * Approving used to go out on the click; it publishes texts on product pages
 * and lets ratings into the score, so it now gets its own AlertDialog with its
 * own words. Rejecting keeps its prompt (TASK-812) and gains a title.
 */
describe("useReviewBulkModeration", () => {
  it("asks before approving — «Опублікувати N відгуки?» — and cancel sends nothing", async () => {
    const user = userEvent.setup();
    const bodies = stubModerate();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole("button", { name: "approve" }));

    const prompt = await screen.findByRole("alertdialog");
    expect(prompt).toHaveTextContent(
      t.approveConfirmTitle(countLabel(2, dict.reviews.itemForms)),
    );
    expect(prompt).toHaveTextContent(t.approveConfirm);

    await user.click(
      within(prompt).getByRole("button", { name: dict.common.cancel }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(bodies).toHaveLength(0);
  });

  it("approves once confirmed", async () => {
    const user = userEvent.setup();
    const bodies = stubModerate();
    const onSuccess = jest.fn();
    renderWithProviders(<Harness onSuccess={onSuccess} />);

    await user.click(screen.getByRole("button", { name: "approve" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: t.approveConfirmLabel(2),
      }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ ids: IDS, action: "approve" });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it("asks before rejecting with a title in the genitive, then rejects", async () => {
    const user = userEvent.setup();
    const bodies = stubModerate();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole("button", { name: "reject" }));

    const prompt = await screen.findByRole("alertdialog");
    expect(prompt).toHaveTextContent(
      t.rejectConfirmTitle(countLabel(2, t.genitiveForms)),
    );
    expect(prompt).toHaveTextContent(t.rejectConfirm(2));

    await user.click(
      within(prompt).getByRole("button", { name: dict.reviews.reject }),
    );
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ ids: IDS, action: "reject" });
  });
});
