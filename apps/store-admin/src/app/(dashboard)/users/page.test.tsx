import { renderWithProviders, screen } from "@/shared/test/render";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict } from "@/shared/config";
import UsersPage from "./page";

// The table is exercised by its own suite and drags in MSW + next/navigation;
// this one is about the page heading.
jest.mock("@/widgets", () => ({
  AdminUserTable: () => null,
  AdminUserTableSkeleton: () => null,
}));

/**
 * TASK-406 — the create-staff CTA is the primary action of this screen. It used
 * to live inside the table toolbar, and on the 2026-08-27 live run the owner
 * concluded a manager could not be created at all.
 */
describe("UsersPage heading", () => {
  it("puts «Створити співробітника» beside the heading for the owner", () => {
    renderWithProviders(
      <WithAuth isOwner>
        <UsersPage />
      </WithAuth>,
    );

    expect(screen.getByText(dict.users.heading)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.users.create }),
    ).toBeInTheDocument();
  });

  it("states that the button creates a new staff account rather than promoting a customer", () => {
    renderWithProviders(
      <WithAuth isOwner>
        <UsersPage />
      </WithAuth>,
    );

    expect(screen.getByText(dict.users.createHint)).toBeInTheDocument();
  });

  it("shows no CTA to a manager", () => {
    renderWithProviders(
      <WithAuth isOwner={false}>
        <UsersPage />
      </WithAuth>,
    );

    expect(
      screen.queryByRole("button", { name: dict.users.create }),
    ).not.toBeInTheDocument();
  });
});
