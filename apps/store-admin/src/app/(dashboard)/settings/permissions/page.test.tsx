import { renderWithProviders, screen } from "@/shared/test/render";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict } from "@/shared/config";
import PermissionsPage from "./page";

// The matrix itself has its own suite (PermissionMatrixForm); this one is about
// the heading.
jest.mock("@/widgets", () => ({
  PermissionMatrixView: () => null,
}));

/**
 * TASK-406 — «Права доступу» is where the owner decides what a manager may do,
 * so it is also where they want to hand someone the account. Sending them to
 * another page to hunt for the button is how the whole AD-RBAC zone went
 * unchecked on the live run.
 */
describe("PermissionsPage heading", () => {
  it("carries the same create-staff CTA as /users for the owner", () => {
    renderWithProviders(
      <WithAuth isOwner>
        <PermissionsPage />
      </WithAuth>,
    );

    expect(
      screen.getByText(dict.permissionsMatrix.heading),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.users.create }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.permissionsMatrix.createStaffHint),
    ).toBeInTheDocument();
  });

  it("shows no CTA to a manager", () => {
    renderWithProviders(
      <WithAuth isOwner={false}>
        <PermissionsPage />
      </WithAuth>,
    );

    expect(
      screen.queryByRole("button", { name: dict.users.create }),
    ).not.toBeInTheDocument();
  });
});
