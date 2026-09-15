import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict } from "@/shared/config";
import { FullAccessPanel } from "./FullAccessPanel";

function admin(overrides: Record<string, unknown> = {}) {
  return {
    id: "admin-1",
    email: "owner@example.com",
    firstName: "Олексій",
    lastName: "Бідяк",
    phone: null,
    role: "ADMIN",
    isOwner: false,
    level: 2,
    isActive: true,
    permissionCount: 0,
    lastSeenAt: null,
    emailVerifiedAt: null,
    lockedUntil: null,
    failedLoginAttempts: 0,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

function stubAdmins(rows: Array<Record<string, unknown>>) {
  server.use(
    http.get("*/api/admin/staff", () =>
      HttpResponse.json({
        data: rows,
        meta: { total: rows.length, page: 1, limit: 100, totalPages: 1 },
      }),
    ),
  );
}

/**
 * Plan 181, decision 5 — the number of people with full access is not capped, it
 * is made visible. A cap would be a number nobody can justify that blocks a
 * legitimate hire at the worst moment; what the owner actually needs to be told
 * is that somebody granted full access two years ago is still on the list.
 */
describe("FullAccessPanel", () => {
  it("counts everyone with full access and names them", async () => {
    stubAdmins([
      admin({ id: "owner-1", isOwner: true, level: 3 }),
      admin({
        id: "deputy-1",
        email: "deputy@example.com",
        firstName: "Ірина",
        lastName: "Мельник",
      }),
    ]);

    renderWithProviders(
      <WithAuth isOwner>
        <FullAccessPanel />
      </WithAuth>,
    );

    expect(
      await screen.findByText(dict.staff.fullAccessHeading(2)),
    ).toBeInTheDocument();
    expect(screen.getByText("Ірина Мельник")).toBeInTheDocument();
    expect(
      screen.getByText(dict.staff.fullAccessOwnerBadge),
    ).toBeInTheDocument();
  });

  /**
   * A deactivated administrator is one status toggle away from full access, and
   * the question this panel answers is "who could", not "who is online". So they
   * are counted — and badged, so the difference is still visible.
   */
  it("counts a deactivated administrator, and says they are switched off", async () => {
    stubAdmins([
      admin({ id: "owner-1", isOwner: true, level: 3 }),
      admin({
        id: "deputy-1",
        email: "left@example.com",
        firstName: "Петро",
        lastName: "Сидоренко",
        isActive: false,
      }),
    ]);

    renderWithProviders(
      <WithAuth isOwner>
        <FullAccessPanel />
      </WithAuth>,
    );

    expect(
      await screen.findByText(dict.staff.fullAccessHeading(2)),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.common.inactive)).toBeInTheDocument();
  });

  /**
   * The heading is the one string in this dictionary that carries a plural
   * table, because «мають 2 осіб» on the panel whose entire job is to be noticed
   * is not a trade worth making. Pinned here so the table cannot rot silently.
   */
  it("agrees grammatically with the count it prints", () => {
    expect(dict.staff.fullAccessHeading(1)).toBe("Повний доступ має 1 особа");
    expect(dict.staff.fullAccessHeading(2)).toBe("Повний доступ мають 2 особи");
    expect(dict.staff.fullAccessHeading(5)).toBe("Повний доступ мають 5 осіб");
    // The 11–14 exception: ends in 1, still takes the last form.
    expect(dict.staff.fullAccessHeading(11)).toBe(
      "Повний доступ мають 11 осіб",
    );
    expect(dict.staff.fullAccessHeading(22)).toBe(
      "Повний доступ мають 22 особи",
    );
  });

  it("uses the singular heading for a shop with one administrator", async () => {
    stubAdmins([admin({ id: "owner-1", isOwner: true, level: 3 })]);

    renderWithProviders(
      <WithAuth isOwner>
        <FullAccessPanel />
      </WithAuth>,
    );

    expect(
      await screen.findByText(dict.staff.fullAccessHeading(1)),
    ).toBeInTheDocument();
  });
});
