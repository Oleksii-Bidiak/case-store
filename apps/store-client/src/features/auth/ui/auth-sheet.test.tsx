import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { AuthSheet } from "./auth-sheet";

// next/navigation is unavailable under jsdom — mock the hooks the forms read.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

describe("AuthSheet", () => {
  it("switches from login to the forgot-password view without closing the sheet", async () => {
    const onOpenChange = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<AuthSheet open onOpenChange={onOpenChange} />);

    // Login view is shown first — the "Забули пароль?" control is present.
    const forgotLink = await screen.findByRole("button", {
      name: dict.auth.login.forgot,
    });
    await user.click(forgotLink);

    // Now the forgot-password view is rendered (its submit button appears)…
    expect(
      await screen.findByRole("button", {
        name: dict.auth.forgotPassword.submit,
      }),
    ).toBeInTheDocument();
    // …and the sheet was never asked to close.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
