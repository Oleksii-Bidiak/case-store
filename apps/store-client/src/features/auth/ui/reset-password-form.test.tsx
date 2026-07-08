import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ResetPasswordForm } from "./reset-password-form";

// next/navigation is unavailable under jsdom — mock the router and search params.
// `mockToken` is mutable so each test controls the `?token=` value.
const mockPush = jest.fn();
let mockToken: string | null = "valid-token-123";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useSearchParams: () => ({
    get: (key: string) => (key === "token" ? mockToken : null),
  }),
}));

/** Build the API error envelope the backend emits for a 401. */
function unauthorized() {
  return HttpResponse.json(
    {
      statusCode: 401,
      error: "UnauthorizedException",
      message: "Invalid or expired reset token",
      path: "/api/auth/password-reset/confirm",
    },
    { status: 401 },
  );
}

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockToken = "valid-token-123";
  });

  it("renders an error state and no form when the token is missing", () => {
    mockToken = null;
    renderWithProviders(<ResetPasswordForm />);

    expect(
      screen.getByText(dict.auth.resetPassword.errorMissingToken),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(dict.auth.resetPassword.newPassword),
    ).not.toBeInTheDocument();
  });

  it("shows a validation error when the passwords do not match", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordForm />);

    await user.type(
      screen.getByLabelText(dict.auth.resetPassword.newPassword),
      "StrongP@ss123",
    );
    await user.type(
      screen.getByLabelText(dict.auth.resetPassword.confirmPassword),
      "Different123",
    );
    await user.click(
      screen.getByRole("button", { name: dict.auth.resetPassword.submit }),
    );

    expect(
      await screen.findByText(dict.auth.register.validationPasswordMatch),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows a validation error for a weak password", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordForm />);

    await user.type(
      screen.getByLabelText(dict.auth.resetPassword.newPassword),
      "weak",
    );
    await user.type(
      screen.getByLabelText(dict.auth.resetPassword.confirmPassword),
      "weak",
    );
    await user.click(
      screen.getByRole("button", { name: dict.auth.resetPassword.submit }),
    );

    expect(
      await screen.findByText(dict.auth.register.validationPassword),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("submits { token, newPassword } and redirects to /login on success", async () => {
    let sentBody: unknown = null;
    server.use(
      http.post("*/api/auth/password-reset/confirm", async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({ data: { message: "ok" } });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordForm />);

    await user.type(
      screen.getByLabelText(dict.auth.resetPassword.newPassword),
      "StrongP@ss123",
    );
    await user.type(
      screen.getByLabelText(dict.auth.resetPassword.confirmPassword),
      "StrongP@ss123",
    );
    await user.click(
      screen.getByRole("button", { name: dict.auth.resetPassword.submit }),
    );

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/login"));
    expect(sentBody).toEqual({
      token: "valid-token-123",
      newPassword: "StrongP@ss123",
    });
  });

  it("shows the invalid-token message on a 401", async () => {
    server.use(
      http.post("*/api/auth/password-reset/confirm", () => unauthorized()),
    );

    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordForm />);

    await user.type(
      screen.getByLabelText(dict.auth.resetPassword.newPassword),
      "StrongP@ss123",
    );
    await user.type(
      screen.getByLabelText(dict.auth.resetPassword.confirmPassword),
      "StrongP@ss123",
    );
    await user.click(
      screen.getByRole("button", { name: dict.auth.resetPassword.submit }),
    );

    expect(
      await screen.findByText(dict.auth.resetPassword.errorInvalidToken),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
