import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict } from "@/shared/config";
import { UserRoleChange } from "./UserRoleChange";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

function stubRoleChange() {
  const calls: string[] = [];
  server.use(
    http.patch("*/api/admin/staff/:id/role", async ({ request }) => {
      const body = (await request.json()) as { role: string };
      calls.push(body.role);
      return HttpResponse.json({
        data: {
          id: "person-1",
          email: "person@example.com",
          firstName: null,
          lastName: null,
          phone: null,
          role: body.role,
          isOwner: false,
          level: body.role === "ADMIN" ? 2 : 1,
          isActive: true,
          permissionCount: 0,
          lastSeenAt: null,
          emailVerifiedAt: null,
          lockedUntil: null,
          failedLoginAttempts: 0,
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-01T10:00:00.000Z",
        },
      });
    }),
  );
  return calls;
}

function render(options: { isOwner?: boolean; currentRole?: string } = {}) {
  return renderWithProviders(
    <WithAuth
      isOwner={options.isOwner ?? true}
      isAdmin
      userId="actor-1"
      permissions={[]}
    >
      <UserRoleChange
        userId="person-1"
        currentRole={options.currentRole ?? "CUSTOMER"}
        targetName="Олена Коваль"
      />
    </WithAuth>,
  );
}

const openRoleSelect = () =>
  userEvent.click(
    screen.getByRole("combobox", { name: dict.users.roleChangeAria }),
  );

/**
 * TASK-480 — appointing an administrator used to be one select and one button.
 * The person silently gained every permission in the catalogue, the audit log
 * and full control over every manager, with nothing on screen saying so, and no
 * confirmation existed anywhere in the panel.
 */
describe("UserRoleChange — appointing an administrator", () => {
  it("asks for confirmation and spells out what the person gains", async () => {
    const calls = stubRoleChange();
    render();

    await openRoleSelect();
    await userEvent.click(
      await screen.findByRole("option", { name: dict.users.roleAdmin }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.users.roleChangeSubmit }),
    );

    // Nothing written yet — the dialog is the gate, not a notification.
    expect(calls).toHaveLength(0);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(dict.staff.promoteGain2)).toBeInTheDocument();
    // The half that is easiest to miss: a deputy who appoints a second deputy
    // has created somebody they cannot themselves demote.
    expect(screen.getByText(dict.staff.promoteUndo)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: dict.staff.promoteConfirm }),
    );
    await waitFor(() => expect(calls).toEqual(["ADMIN"]));
  });

  it("changes a role to MANAGER without a confirmation — that one is reversible", async () => {
    const calls = stubRoleChange();
    render();

    await openRoleSelect();
    await userEvent.click(
      await screen.findByRole("option", { name: dict.users.roleManager }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.users.roleChangeSubmit }),
    );

    await waitFor(() => expect(calls).toEqual(["MANAGER"]));
  });

  it("offers a deputy no ADMIN option — `assertMayAssign` is strictly-greater", async () => {
    render({ isOwner: false });

    await openRoleSelect();

    expect(
      await screen.findByRole("option", { name: dict.users.roleManager }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: dict.users.roleAdmin }),
    ).not.toBeInTheDocument();
  });

  it("keeps the ADMIN option visible for a deputy when the target already is one", async () => {
    // Otherwise the Select would hold a value it has no item for and render an
    // empty trigger — an admin's card would claim they have no role at all.
    render({ isOwner: false, currentRole: "ADMIN" });

    await openRoleSelect();

    expect(
      await screen.findByRole("option", { name: dict.users.roleAdmin }),
    ).toBeInTheDocument();
  });
});
