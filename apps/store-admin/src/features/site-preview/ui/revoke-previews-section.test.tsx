import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { RevokePreviewsSection } from "./revoke-previews-section";

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const t = dict.sitePreview;

function revokeAnswers(status: number): { calls: number } {
  const counter = { calls: 0 };
  server.use(
    http.delete("*/api/admin/preview-tokens", () => {
      counter.calls += 1;
      return status === 204
        ? new HttpResponse(null, { status: 204 })
        : HttpResponse.json({ message: "nope" }, { status });
    }),
  );
  return counter;
}

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("RevokePreviewsSection — «Відкликати всі прев'ю» (TASK-670)", () => {
  it("explains what a preview link is and that only all of them can be revoked", () => {
    renderWithProviders(<RevokePreviewsSection />);

    expect(
      screen.getByRole("region", { name: t.settingsHeading }),
    ).toBeInTheDocument();
    expect(screen.getByText(t.settingsIntro)).toBeInTheDocument();
    expect(screen.getByText(t.settingsRevokeNote)).toBeInTheDocument();
  });

  it("asks first, then revokes every link and says so", async () => {
    const user = userEvent.setup();
    const revoke = revokeAnswers(204);
    renderWithProviders(<RevokePreviewsSection />);

    await user.click(screen.getByRole("button", { name: t.revokeAll }));

    const dialog = await screen.findByRole("alertdialog", {
      name: t.revokeTitle,
    });
    expect(dialog).toHaveTextContent(t.revokeBody);
    expect(revoke.calls).toBe(0);

    await user.click(screen.getByRole("button", { name: t.revokeConfirm }));

    await waitFor(() => expect(revoke.calls).toBe(1));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(t.toastRevoked),
    );
  });

  it("revokes nothing when the question is cancelled", async () => {
    const user = userEvent.setup();
    const revoke = revokeAnswers(204);
    renderWithProviders(<RevokePreviewsSection />);

    await user.click(screen.getByRole("button", { name: t.revokeAll }));
    await screen.findByRole("alertdialog", { name: t.revokeTitle });
    await user.click(screen.getByRole("button", { name: dict.common.cancel }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(revoke.calls).toBe(0);
  });

  it("reports a refused revoke", async () => {
    const user = userEvent.setup();
    revokeAnswers(403);
    renderWithProviders(<RevokePreviewsSection />);

    await user.click(screen.getByRole("button", { name: t.revokeAll }));
    await user.click(
      await screen.findByRole("button", { name: t.revokeConfirm }),
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(t.toastRevokeFailed),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
