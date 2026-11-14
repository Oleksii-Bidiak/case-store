import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { TransferOwnershipDialog } from "./TransferOwnershipDialog";

jest.mock("@/shared/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
const { toast } = jest.requireMock("@/shared/ui/toast") as {
  toast: { error: jest.Mock };
};

const d = dict.staff;
const URL = "*/api/admin/staff/:id/transfer-ownership";

const passwordField = () => screen.getByLabelText(d.transferPasswordLabel);
const submit = () =>
  userEvent.click(screen.getByRole("button", { name: d.transferSubmit }));

function renderDialog() {
  renderWithProviders(
    <TransferOwnershipDialog
      userId="admin-2"
      targetName="Олена Коваленко"
      open
      onOpenChange={() => {}}
    />,
  );
}

/** TASK-1984 (forms Rules 6a/6c): the password error under the field, once. */
describe("TransferOwnershipDialog", () => {
  beforeEach(() => toast.error.mockClear());

  it("says «required» (not «wrong») for an empty password and sends nothing", async () => {
    const posted = jest.fn();
    server.use(
      http.post(URL, () => {
        posted();
        return HttpResponse.json({});
      }),
    );
    renderDialog();

    await submit();

    expect(passwordField()).toHaveAttribute("aria-invalid", "true");
    expect(passwordField()).toHaveAccessibleDescription(
      expect.stringContaining(d.transferPasswordRequired),
    );
    expect(screen.queryByText(d.transferWrongPassword)).toBeNull();
    expect(posted).not.toHaveBeenCalled();
  });

  it("puts a wrong password (401) under the field, with no toast", async () => {
    server.use(
      http.post(URL, () =>
        HttpResponse.json(
          { statusCode: 401, message: "Invalid credentials" },
          { status: 401 },
        ),
      ),
    );
    renderDialog();

    await userEvent.type(passwordField(), "typo");
    await submit();

    await waitFor(() =>
      expect(passwordField()).toHaveAttribute("aria-invalid", "true"),
    );
    expect(passwordField()).toHaveAccessibleDescription(
      expect.stringContaining(d.transferWrongPassword),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows a refusal of the act itself once, below the form — not under the field", async () => {
    server.use(
      http.post(URL, () =>
        HttpResponse.json(
          { statusCode: 409, message: "The recipient is not an administrator" },
          { status: 409 },
        ),
      ),
    );
    renderDialog();

    await userEvent.type(passwordField(), "Correct1");
    await submit();

    expect(
      await screen.findByText("The recipient is not an administrator"),
    ).toBeInTheDocument();
    expect(passwordField()).not.toHaveAttribute("aria-invalid");
    expect(toast.error).not.toHaveBeenCalled();
  });
});
