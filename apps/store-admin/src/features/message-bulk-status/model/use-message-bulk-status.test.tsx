import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { BulkContactMessageStatusDtoStatus } from "@/entities/contact";
import { useMessageBulkStatus } from "./use-message-bulk-status";

const IDS = ["msg-1", "msg-2"];

function Harness({ onSuccess }: { onSuccess?: () => void }) {
  const bulk = useMessageBulkStatus({ onSuccess });
  return (
    <>
      {(
        [
          BulkContactMessageStatusDtoStatus.IN_PROGRESS,
          BulkContactMessageStatusDtoStatus.READ,
          BulkContactMessageStatusDtoStatus.ARCHIVED,
        ] as const
      ).map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => bulk.setStatus(IDS, status)}
        >
          {status}
        </button>
      ))}
      <span>{bulk.isPending ? "pending" : "idle"}</span>
    </>
  );
}

/**
 * TASK-354 / wave 198 (MessagesProposal З2): the inbox's three bulk moves.
 * Nothing here leaves the panel, so — unlike the review verdicts — none of
 * them asks first: one click, one batch request, and the caller clears its
 * selection once the server confirms.
 */
describe("useMessageBulkStatus", () => {
  it.each(["IN_PROGRESS", "READ", "ARCHIVED"])(
    "sends one batch for %s without a prompt, then reports success",
    async (status) => {
      const bodies: unknown[] = [];
      const onSuccess = jest.fn();
      server.use(
        http.patch("*/api/contact/admin/status", async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json({ data: { updatedCount: IDS.length } });
        }),
      );
      renderWithProviders(<Harness onSuccess={onSuccess} />);

      await userEvent.click(screen.getByRole("button", { name: status }));

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      await waitFor(() => expect(bodies).toEqual([{ ids: IDS, status }]));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    },
  );

  it("does not report success when the batch fails", async () => {
    const onSuccess = jest.fn();
    server.use(
      http.patch("*/api/contact/admin/status", () =>
        HttpResponse.json({ message: "nope" }, { status: 403 }),
      ),
    );
    renderWithProviders(<Harness onSuccess={onSuccess} />);

    await userEvent.click(screen.getByRole("button", { name: "READ" }));
    await waitFor(() => expect(screen.getByText("idle")).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
