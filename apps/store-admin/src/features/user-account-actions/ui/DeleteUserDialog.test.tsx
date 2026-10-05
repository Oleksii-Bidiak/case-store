import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { DeleteUserDialog } from "./DeleteUserDialog";

const replaceMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: jest.fn() }),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const CUSTOMER_ID = "customer-uuid-1";

/**
 * Wave 198 (UsersProposal К6, TASK-812 canon): deleting a customer is an
 * AlertDialog — a destructive, irreversible step that Esc, the overlay and
 * «Скасувати» all back out of, and that names the account it is about to act on.
 */
describe("DeleteUserDialog", () => {
  beforeEach(() => replaceMock.mockClear());

  it("is an AlertDialog that names the account and calls the API only on confirm", async () => {
    let deleted = 0;
    server.use(
      http.delete("*/api/users/:id", () => {
        deleted += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const onOpenChange = jest.fn();

    renderWithProviders(
      <DeleteUserDialog
        userId={CUSTOMER_ID}
        email="olena@example.com"
        open
        onOpenChange={onOpenChange}
      />,
      { auth: { isOwner: true } },
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(
        dict.users.deleteDescription("olena@example.com"),
      ),
    ).toBeInTheDocument();
    expect(deleted).toBe(0);

    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.users.deleteConfirm }),
    );
    await waitFor(() => expect(deleted).toBe(1));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/users"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("refuses to delete the signed-in account", async () => {
    renderWithProviders(
      <DeleteUserDialog
        userId="admin-1"
        email="admin@example.com"
        open
        onOpenChange={jest.fn()}
      />,
      { auth: { isOwner: true } },
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(dict.users.deleteSelf)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: dict.users.deleteConfirm }),
    ).toBeDisabled();
  });
});
