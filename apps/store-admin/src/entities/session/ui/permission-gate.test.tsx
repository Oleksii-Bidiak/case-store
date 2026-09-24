import { renderWithProviders, screen } from "@/shared/test/render";
import { WithAuth } from "../model/auth-context.fixture";
import { PermissionGate } from "./permission-gate";

/**
 * TASK-639 / TASK-715 — the one refusal every gated section shares.
 *
 * Before it, `/staff*` and `/audit-log` rendered their pages to a manager who
 * typed the URL, and each failed query drew its own red banner. The gate
 * replaces all of that with a single, named refusal — and must never flash that
 * refusal at someone whose grants are simply still loading.
 */
describe("PermissionGate", () => {
  const child = <p>Секція</p>;
  const gate = (
    <PermissionGate
      permission="staff:read"
      title="Немає доступу до персоналу."
      hint="Лише власник і заступники."
    >
      {child}
    </PermissionGate>
  );

  it("renders the children for a session holding the permission", () => {
    renderWithProviders(
      <WithAuth isOwner={false} permissions={["staff:read"]}>
        {gate}
      </WithAuth>,
    );

    expect(screen.getByText("Секція")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows ONE refusal with the title and hint, and not the children", () => {
    renderWithProviders(
      <WithAuth isOwner={false} permissions={["orders:read"]}>
        {gate}
      </WithAuth>,
    );

    expect(screen.queryByText("Секція")).not.toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Немає доступу до персоналу.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Лише власник і заступники.",
    );
  });

  it("lets an admin through — the matrix never governs them", () => {
    renderWithProviders(
      <WithAuth isOwner permissions={[]}>
        {gate}
      </WithAuth>,
    );

    expect(screen.getByText("Секція")).toBeInTheDocument();
  });

  it("waits for the grant set instead of flashing a refusal", () => {
    renderWithProviders(
      <WithAuth isOwner={false} permissions={[]} arePermissionsLoading>
        {gate}
      </WithAuth>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Секція")).not.toBeInTheDocument();
  });
});
