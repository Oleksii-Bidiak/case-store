import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { UserPasswordResetDialog } from "./UserPasswordResetDialog";

jest.mock("@/shared/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
const { toast } = jest.requireMock("@/shared/ui/toast") as {
  toast: { error: jest.Mock };
};

const d = dict.users;
const URL = "*/api/admin/staff/:id/password";

const passwordField = () => screen.getByLabelText(d.passwordResetNew);
const submit = () =>
  userEvent.click(screen.getByRole("button", { name: d.passwordResetSubmit }));

function renderDialog() {
  renderWithProviders(
    <UserPasswordResetDialog userId="staff-2" open onOpenChange={() => {}} />,
  );
}

/** TASK-1984 (forms Rules 6a/6c): the error under the input, shown once. */
describe("UserPasswordResetDialog", () => {
  beforeEach(() => toast.error.mockClear());

  it("puts a weak password's reason under the input, with aria, and sends nothing", async () => {
    const posted = jest.fn();
    server.use(
      http.post(URL, () => {
        posted();
        return HttpResponse.json({ data: { success: true } });
      }),
    );
    renderDialog();

    await userEvent.type(passwordField(), "weak");
    await submit();

    expect(passwordField()).toHaveAttribute("aria-invalid", "true");
    expect(passwordField()).toHaveAccessibleDescription(
      expect.stringContaining(d.passwordWeak),
    );
    expect(posted).not.toHaveBeenCalled();
  });

  it("puts a DTO 400 on the password under the input, with no toast", async () => {
    server.use(
      http.post(URL, () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: "Password must contain…",
            fieldErrors: [
              { field: "newPassword", constraint: "isStaffPassword" },
            ],
          },
          { status: 400 },
        ),
      ),
    );
    renderDialog();

    await userEvent.type(passwordField(), "Password123");
    await submit();

    await waitFor(() =>
      expect(passwordField()).toHaveAttribute("aria-invalid", "true"),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows a field-less refusal once, below the form", async () => {
    server.use(
      http.post(URL, () =>
        HttpResponse.json(
          { statusCode: 403, message: "Only the owner may do this" },
          { status: 403 },
        ),
      ),
    );
    renderDialog();

    await userEvent.type(passwordField(), "Password123");
    await submit();

    expect(
      await screen.findByText("Only the owner may do this"),
    ).toBeInTheDocument();
    expect(passwordField()).not.toHaveAttribute("aria-invalid");
    expect(toast.error).not.toHaveBeenCalled();
  });
});
