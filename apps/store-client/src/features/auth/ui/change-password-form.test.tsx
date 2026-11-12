import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ChangePasswordForm } from "./change-password-form";

// next/navigation is unavailable under jsdom — mock the router.
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

const toastSuccess = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const d = dict.auth.changePassword;

/**
 * Register the change-password endpoint and return a recorder of the bodies it
 * received — so a test can assert the form did NOT reach the network.
 */
function captureChangePassword(
  respond: () => Response = () =>
    HttpResponse.json({ data: { message: "ok" } }),
) {
  const calls: unknown[] = [];
  server.use(
    http.post("*/api/auth/password/change", async ({ request }) => {
      calls.push(await request.json());
      return respond();
    }),
  );
  return calls;
}

/** The envelope the backend emits when `currentPassword` does not match. */
function wrongCurrentPassword() {
  return HttpResponse.json(
    {
      statusCode: 401,
      error: "UnauthorizedException",
      message: "Invalid credentials",
      path: "/api/auth/password/change",
    },
    { status: 401 },
  );
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  {
    current = "OldP@ssw0rd",
    next = "StrongP@ss123",
    confirm = next,
  }: { current?: string; next?: string; confirm?: string } = {},
) {
  await user.type(screen.getByLabelText(d.currentPassword), current);
  await user.type(screen.getByLabelText(d.newPassword), next);
  await user.type(screen.getByLabelText(d.confirmPassword), confirm);
  await user.click(screen.getByRole("button", { name: d.submit }));
}

describe("ChangePasswordForm", () => {
  beforeEach(() => {
    mockPush.mockClear();
    toastSuccess.mockClear();
  });

  it("warns that every session ends before the user submits", () => {
    renderWithProviders(<ChangePasswordForm />, {
      auth: { isAuthenticated: true },
    });

    expect(screen.getByText(d.sessionsWarning)).toBeInTheDocument();
  });

  // TASK-871: the same shared primitives as the auth pages, 44px targets.
  it("builds its fields and actions on the shared Input and Button", () => {
    renderWithProviders(<ChangePasswordForm onCancel={jest.fn()} />, {
      auth: { isAuthenticated: true },
    });

    for (const label of [d.currentPassword, d.newPassword, d.confirmPassword]) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute("data-slot", "input");
      expect(input).toHaveClass("h-11");
    }
    expect(screen.getByLabelText(d.newPassword)).toHaveAccessibleDescription(
      dict.auth.register.passwordHint,
    );
    for (const name of [d.submit, d.cancel]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("data-slot", "button");
      expect(button).toHaveClass("h-11", "rounded-cta");
    }
  });

  it("rejects a weak new password without calling the API", async () => {
    const calls = captureChangePassword();
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordForm />, {
      auth: { isAuthenticated: true },
    });

    await fillForm(user, { next: "weak", confirm: "weak" });

    expect(
      await screen.findByText(dict.auth.register.validationPassword),
    ).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("rejects a new password that breaks the policy without calling the API", async () => {
    const calls = captureChangePassword();
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordForm />, {
      auth: { isAuthenticated: true },
    });

    // Long enough, but all lowercase — no uppercase, no digit.
    await fillForm(user, { next: "alllowercase", confirm: "alllowercase" });

    expect(
      await screen.findByText(dict.auth.register.validationPasswordPolicy),
    ).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("rejects a mismatched confirmation without calling the API", async () => {
    const calls = captureChangePassword();
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordForm />, {
      auth: { isAuthenticated: true },
    });

    await fillForm(user, {
      next: "StrongP@ss123",
      confirm: "DifferentP@ss123",
    });

    expect(
      await screen.findByText(dict.auth.register.validationPasswordMatch),
    ).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("rejects a new password identical to the current one — it would end every session for nothing", async () => {
    const calls = captureChangePassword();
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordForm />, {
      auth: { isAuthenticated: true },
    });

    await fillForm(user, { current: "StrongP@ss123", next: "StrongP@ss123" });

    expect(
      await screen.findByText(d.validationSameAsCurrent),
    ).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("puts 'current password is wrong' under the current-password field on a 401", async () => {
    captureChangePassword(() => wrongCurrentPassword());
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordForm />, {
      auth: { isAuthenticated: true },
    });

    await fillForm(user);

    // TASK-1984 (Rule 6b): under the field, not a form-bottom banner.
    const current = screen.getByLabelText(d.currentPassword);
    await waitFor(() =>
      expect(current).toHaveAttribute("aria-invalid", "true"),
    );
    expect(current).toHaveAccessibleDescription(d.errorWrongCurrent);
    expect(screen.getAllByText(d.errorWrongCurrent)).toHaveLength(1);
    expect(
      screen.queryByText(dict.common.genericError),
    ).not.toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // TASK-1984 (Rule 6b): a 400 about the new password lands under that field.
  it("puts a DTO 400 on newPassword under the new-password field", async () => {
    captureChangePassword(() =>
      HttpResponse.json(
        {
          statusCode: 400,
          message: ["Password must be at least 8 characters long"],
          fieldErrors: [{ field: "newPassword", constraint: "minLength" }],
        },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordForm />, {
      auth: { isAuthenticated: true },
    });

    await fillForm(user);

    const next = screen.getByLabelText(d.newPassword);
    await waitFor(() => expect(next).toHaveAttribute("aria-invalid", "true"));
    expect(next).toHaveAccessibleDescription(
      dict.auth.register.validationPassword,
    );
    expect(
      screen.queryByText(dict.common.genericError),
    ).not.toBeInTheDocument();
  });

  it("puts the staff-policy 400 (no fieldErrors) under the new-password field", async () => {
    captureChangePassword(() =>
      HttpResponse.json(
        {
          statusCode: 400,
          error: "BadRequestException",
          message:
            "Password must contain at least one lowercase letter, one uppercase letter and one digit",
        },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordForm />, {
      auth: { isAuthenticated: true },
    });

    await fillForm(user, { next: "strongpass123" });

    const next = screen.getByLabelText(d.newPassword);
    await waitFor(() =>
      expect(next).toHaveAccessibleDescription(
        dict.auth.register.validationPasswordPolicyStaff,
      ),
    );
    expect(
      screen.queryByText(dict.common.genericError),
    ).not.toBeInTheDocument();
  });

  it("falls back to the generic error on a 500", async () => {
    captureChangePassword(() =>
      HttpResponse.json({ statusCode: 500 }, { status: 500 }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordForm />, {
      auth: { isAuthenticated: true },
    });

    await fillForm(user);

    expect(
      await screen.findByText(dict.common.genericError),
    ).toBeInTheDocument();
  });

  it("submits { currentPassword, newPassword } and signs the user out on success", async () => {
    const calls = captureChangePassword();
    const clearTokens = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordForm />, {
      auth: { isAuthenticated: true, clearTokens },
    });

    await fillForm(user);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/login"));
    expect(calls).toEqual([
      { currentPassword: "OldP@ssw0rd", newPassword: "StrongP@ss123" },
    ]);
    // The backend revoked this session too — staying "logged in" would break at
    // the next request instead of here.
    expect(clearTokens).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith(d.success);
  });

  it("calls onCancel when the form is dismissed", async () => {
    const onCancel = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordForm onCancel={onCancel} />, {
      auth: { isAuthenticated: true },
    });

    await user.click(screen.getByRole("button", { name: d.cancel }));
    expect(onCancel).toHaveBeenCalled();
  });
});
