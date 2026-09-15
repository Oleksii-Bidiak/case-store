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
 * TASK-480 — this screen is the CUSTOMER list now.
 *
 * TASK-406 had put «Створити співробітника» beside this heading, because on the
 * 2026-08-27 run the owner concluded a manager could not be created at all. The
 * button worked; the problem is that since TASK-476 `GET /api/users` returns
 * only shoppers, so the account it created never appeared in the list below it.
 * Hiring moved to `/staff`, and what stays here is a line saying where it went —
 * for the same owner, at the same moment, with a destination this time.
 */
describe("UsersPage heading", () => {
  it("names the screen «Клієнти» and points at «Персонал» for staff", () => {
    renderWithProviders(
      <WithAuth isOwner>
        <UsersPage />
      </WithAuth>,
    );

    expect(screen.getByText(dict.users.heading)).toBeInTheDocument();
    expect(screen.getByText(dict.users.intro)).toBeInTheDocument();
  });

  it("offers no hiring CTA here — not even to the owner", () => {
    renderWithProviders(
      <WithAuth isOwner>
        <UsersPage />
      </WithAuth>,
    );

    expect(
      screen.queryByRole("button", { name: dict.staff.create }),
    ).not.toBeInTheDocument();
  });
});
