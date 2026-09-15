import { renderWithProviders, screen } from "@/shared/test/render";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict } from "@/shared/config";
import { ReturnsPermissionGate } from "./returns-permission-gate";

/**
 * TASK-370 — `/returns` and `/returns/[id]` were covered by `AdminShellGuard`
 * alone, which asks only `isStaff`. Every staff account could therefore read
 * every return in the shop — customer email, operator notes, refunded amounts —
 * by typing the URL, and `PERM.returnsRead` was referenced nowhere at all.
 */
describe("ReturnsPermissionGate (TASK-370)", () => {
  const child = <p>Черга повернень</p>;

  it("renders the section for a manager holding returns:read", () => {
    renderWithProviders(
      <WithAuth isOwner={false} permissions={["returns:read"]}>
        <ReturnsPermissionGate>{child}</ReturnsPermissionGate>
      </WithAuth>,
    );

    expect(screen.getByText("Черга повернень")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refuses a staff member without it, and names the missing permission", () => {
    renderWithProviders(
      <WithAuth isOwner={false} permissions={["orders:read", "orders:write"]}>
        <ReturnsPermissionGate>{child}</ReturnsPermissionGate>
      </WithAuth>,
    );

    expect(screen.queryByText("Черга повернень")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(dict.returns.forbidden);
    // Naming the box the owner has to tick is the whole difference between
    // "ask for access" and "the panel is broken".
    expect(screen.getByRole("alert")).toHaveTextContent(
      dict.returns.forbiddenHint,
    );
  });

  it("lets the owner through — the matrix never governs them", () => {
    renderWithProviders(
      <WithAuth isOwner permissions={[]}>
        <ReturnsPermissionGate>{child}</ReturnsPermissionGate>
      </WithAuth>,
    );

    expect(screen.getByText("Черга повернень")).toBeInTheDocument();
  });

  it("waits for the grant set instead of flashing a refusal at someone who has it", () => {
    renderWithProviders(
      <WithAuth isOwner={false} permissions={[]} arePermissionsLoading>
        <ReturnsPermissionGate>{child}</ReturnsPermissionGate>
      </WithAuth>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Черга повернень")).not.toBeInTheDocument();
  });
});
