import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import StaffPage from "./page";
import PermissionTemplatesPage from "./templates/page";
import StaffDetailPage from "./[id]/page";
import AuditLogPage from "../audit-log/page";

// The sections themselves are out of scope: each would fire its own `staff:read`
// / `audit:read` query. Stubs stand in for them, so what is under test is only
// the page's decision whether to mount them at all.
jest.mock("@/widgets", () => ({
  FullAccessPanel: () => <p>Панель повного доступу</p>,
  StaffTable: () => <p>Реєстр співробітників</p>,
  StaffTableSkeleton: () => null,
  StaffDetailView: () => <p>Картка співробітника</p>,
  StaffDetailSkeleton: () => null,
  PermissionTemplatesView: () => <p>Шаблони</p>,
  PermissionTemplatesSkeleton: () => null,
  AuditLogView: () => <p>Журнал</p>,
  AuditLogSkeleton: () => null,
}));
jest.mock("@/features/staff-create", () => ({
  CreateStaffButton: () => <button type="button">Додати співробітника</button>,
}));

/** A manager: signed in, holding the everyday rights but not the staff ones. */
const MANAGER = { permissions: ["orders:read", "orders:write"] };
const DEPUTY = { isAdmin: true, permissions: [] };

/**
 * TASK-639 — `/staff`, `/staff/[id]`, `/staff/templates` and `/audit-log`
 * rendered their widgets to any staff session that typed the URL, and each
 * widget's 403 drew its own red banner. `staff:read` / `audit:read` are not
 * grantable, so for EVERY manager that was the guaranteed state. Now: one
 * refusal, saying who does have access.
 */
describe("staff and audit-log pages — one clean refusal (TASK-639)", () => {
  it("/staff refuses a manager ONCE, and hides the header buttons too", () => {
    renderWithProviders(<StaffPage />, { auth: MANAGER });

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(dict.staff.forbidden);
    expect(screen.getByRole("alert")).toHaveTextContent(
      dict.staff.forbiddenHint,
    );
    // The heading still says which section refused.
    expect(
      screen.getByRole("heading", { name: dict.staff.heading }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Реєстр співробітників")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: dict.staff.templatesNav }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Додати співробітника" }),
    ).not.toBeInTheDocument();
  });

  it("/staff renders the register for a deputy admin", () => {
    renderWithProviders(<StaffPage />, { auth: DEPUTY });

    expect(screen.getByText("Реєстр співробітників")).toBeInTheDocument();
    expect(screen.getByText("Панель повного доступу")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.staff.templatesNav }),
    ).toHaveAttribute("href", "/staff/templates");
    expect(
      screen.getByRole("button", { name: "Додати співробітника" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  /**
   * TASK-1059 (owner's decision 2026-09-30): the section is «Співробітники» —
   * menu, heading, the back link and the tab title all say the same word.
   */
  it("calls the section «Співробітники» everywhere it is named", () => {
    renderWithProviders(<StaffPage />, { auth: DEPUTY });

    expect(
      screen.getByRole("heading", { name: "Співробітники" }),
    ).toBeInTheDocument();
    expect(dict.nav.staff).toBe("Співробітники");
    expect(dict.staff.back).toBe("← Співробітники");
    expect(dict.staff.metaTitle).toBe("Співробітники — Адмін");
    expect(screen.getByText(dict.staff.intro)).toBeInTheDocument();
  });

  it("/staff/templates refuses a manager once", () => {
    renderWithProviders(<PermissionTemplatesPage />, { auth: MANAGER });

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(dict.staff.forbidden);
    expect(screen.queryByText("Шаблони")).not.toBeInTheDocument();
    // The back link leads to /staff, which would refuse again — hidden too.
    expect(
      screen.queryByRole("link", { name: dict.staff.back }),
    ).not.toBeInTheDocument();
  });

  it("/staff/templates renders the templates for a deputy admin", () => {
    renderWithProviders(<PermissionTemplatesPage />, { auth: DEPUTY });

    expect(screen.getByText("Шаблони")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.staff.back }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("/staff/[id] renders the card for a deputy admin", async () => {
    renderWithProviders(
      await StaffDetailPage({ params: Promise.resolve({ id: "user-1" }) }),
      { auth: DEPUTY },
    );

    expect(screen.getByText("Картка співробітника")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("/staff/[id] refuses a manager once", async () => {
    renderWithProviders(
      await StaffDetailPage({ params: Promise.resolve({ id: "user-1" }) }),
      { auth: MANAGER },
    );

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(dict.staff.forbidden);
    expect(screen.queryByText("Картка співробітника")).not.toBeInTheDocument();
  });

  it("/audit-log refuses a manager once, naming who reads the log", () => {
    renderWithProviders(<AuditLogPage />, { auth: MANAGER });

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      dict.auditLog.forbidden,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      dict.auditLog.forbiddenHint,
    );
    expect(screen.queryByText("Журнал")).not.toBeInTheDocument();
  });

  it("/audit-log renders the log for a deputy admin", () => {
    renderWithProviders(<AuditLogPage />, { auth: DEPUTY });

    expect(screen.getByText("Журнал")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
