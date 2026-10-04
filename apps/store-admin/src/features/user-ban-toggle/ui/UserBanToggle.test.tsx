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
import { UserBanToggle } from "./UserBanToggle";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

/** Somebody other than the signed-in fixture user (`admin-1`). */
const CUSTOMER_ID = "customer-uuid-1";

/**
 * TASK-716 — `PATCH /users/:id/deactivate` and `/activate` need
 * `customers:write`. A manager with only `customers:read` used to be offered the
 * button, and every click was a 403. The button is now absent for them.
 */
describe("UserBanToggle — customers:write gate (TASK-716)", () => {
  it("renders nothing for a session that may only read customers", () => {
    const { container } = renderWithProviders(
      <UserBanToggle userId={CUSTOMER_ID} isActive />,
      { auth: { permissions: ["customers:read"] } },
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("offers «Деактивувати» to a session holding customers:write", () => {
    renderWithProviders(<UserBanToggle userId={CUSTOMER_ID} isActive />, {
      auth: { permissions: ["customers:read", "customers:write"] },
    });

    expect(
      screen.getByRole("button", { name: dict.userBan.deactivateUserAria }),
    ).toBeEnabled();
  });

  it("offers «Активувати» on a deactivated account, and the click reaches the API", async () => {
    let calls = 0;
    server.use(
      http.patch("*/api/users/:id/activate", () => {
        calls += 1;
        return HttpResponse.json({ data: { id: CUSTOMER_ID, isActive: true } });
      }),
    );

    renderWithProviders(
      <UserBanToggle userId={CUSTOMER_ID} isActive={false} />,
      { auth: { permissions: ["customers:read", "customers:write"] } },
    );

    await userEvent.click(
      screen.getByRole("button", { name: dict.userBan.activateUserAria }),
    );
    await waitFor(() => expect(calls).toBe(1));
  });

  it("asks in an AlertDialog before deactivating, and only then calls the API (К6)", async () => {
    let calls = 0;
    server.use(
      http.patch("*/api/users/:id/deactivate", () => {
        calls += 1;
        return HttpResponse.json({
          data: { id: CUSTOMER_ID, isActive: false },
        });
      }),
    );

    renderWithProviders(
      <UserBanToggle
        userId={CUSTOMER_ID}
        isActive
        displayName="Олена Шевченко (olena@example.com)"
      />,
      { auth: { permissions: ["customers:write"] } },
    );

    await userEvent.click(
      screen.getByRole("button", { name: dict.userBan.deactivateUserAria }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(
        dict.userBan.confirmDescription("Олена Шевченко (olena@example.com)"),
      ),
    ).toBeInTheDocument();
    expect(calls).toBe(0);

    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.userBan.confirmAction }),
    );
    await waitFor(() => expect(calls).toBe(1));
  });

  it("still refuses a self-ban to a writer (the pre-existing UI guard)", () => {
    renderWithProviders(<UserBanToggle userId="admin-1" isActive />, {
      auth: { permissions: ["customers:write"] },
    });

    expect(
      screen.getByRole("button", { name: dict.userBan.cannotSelf }),
    ).toBeDisabled();
  });
});
