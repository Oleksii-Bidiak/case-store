import { toast } from "@/shared/ui/toast";
import { render, screen, userEvent, waitFor } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { Providers } from "./providers";

/**
 * TASK-422 — the operator must be able to dismiss a toast.
 *
 * Before this, `<Toaster richColors position="top-right" />` carried no
 * `closeButton`, so a message could only be waited out (or swiped, which is not
 * discoverable with a mouse). These assert the rendered result, not the props
 * object: a regression that drops `closeButton` from providers.tsx turns the
 * first case red because no button exists in the toast at all.
 *
 * `Providers` is rendered whole rather than a bare `<Toaster>` — the point is
 * that the app's real provider tree is what configures the Toaster. It mounts
 * AuthProvider, whose bootstrap `POST /api/auth/refresh` the default MSW
 * handlers already answer (401 → signed out), so this stays off
 * `onUnhandledRequest: "error"`. ReactQueryDevtools renders null outside
 * NODE_ENV=development. `render` (not `renderWithProviders`) because Providers
 * brings its own QueryClientProvider.
 */
describe("Providers — Toaster", () => {
  afterEach(() => {
    toast.dismiss();
  });

  it("renders a dismiss button on a toast, labelled in Ukrainian", async () => {
    render(<Providers>{null}</Providers>);

    toast.error("Не вдалося зберегти товар");

    expect(
      await screen.findByText("Не вдалося зберегти товар"),
    ).toBeInTheDocument();

    // sonner's own default label is the English "Close toast"; the panel is
    // Ukrainian, so the accessible name must come from the dictionary.
    expect(
      screen.getByRole("button", { name: dict.common.close }),
    ).toBeInTheDocument();
  });

  it("removes the toast when the operator clicks dismiss", async () => {
    const user = userEvent.setup();

    render(<Providers>{null}</Providers>);

    toast.success("Товар збережено");
    expect(await screen.findByText("Товар збережено")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: dict.common.close }));

    await waitFor(() => {
      expect(screen.queryByText("Товар збережено")).not.toBeInTheDocument();
    });
  });
});
