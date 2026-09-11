import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict } from "@/shared/config";
import { CreateStaffButton } from "./CreateStaffButton";

/**
 * TASK-406 — the dialog behind this button has existed since TASK-333, but its
 * only trigger sat in the user table's toolbar and the owner never found it. On
 * the 2026-08-27 live run that cost the entire AD-RBAC zone: with no manager
 * account, none of its 25 checks could be run.
 */
describe("CreateStaffButton", () => {
  it("opens the create-staff dialog for the owner", async () => {
    renderWithProviders(
      <WithAuth isOwner>
        <CreateStaffButton />
      </WithAuth>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: dict.users.create }),
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(dict.users.createHeading)).toBeInTheDocument();
    // The copy that answers the owner's actual misconception: this creates a
    // NEW staff account, it does not promote an existing shopper.
    expect(screen.getByText(dict.users.createDescription)).toBeInTheDocument();
  });

  it("renders nothing for a manager — POST /users is @OwnerOnly()", () => {
    renderWithProviders(
      <WithAuth isOwner={false}>
        <CreateStaffButton />
      </WithAuth>,
    );

    expect(
      screen.queryByRole("button", { name: dict.users.create }),
    ).not.toBeInTheDocument();
  });
});
