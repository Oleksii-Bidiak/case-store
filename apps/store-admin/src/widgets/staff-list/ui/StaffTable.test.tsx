import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict } from "@/shared/config";
import { StaffTable } from "./StaffTable";

const mockReplace = jest.fn();
const mockSearchParamsRef = { current: new URLSearchParams("") };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/staff",
  useSearchParams: () => mockSearchParamsRef.current,
}));

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "manager-1",
    email: "manager@example.com",
    firstName: "Олена",
    lastName: "Коваль",
    phone: null,
    role: "MANAGER",
    isOwner: false,
    level: 1,
    isActive: true,
    permissionCount: 4,
    lastSeenAt: "2026-09-10T08:00:00.000Z",
    emailVerifiedAt: null,
    lockedUntil: null,
    failedLoginAttempts: 0,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

function stubStaff(rows: Array<Record<string, unknown>>) {
  server.use(
    http.get("*/api/admin/staff", () =>
      HttpResponse.json({
        data: rows,
        meta: { total: rows.length, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
  );
}

function renderTable() {
  return renderWithProviders(
    <WithAuth isOwner>
      <StaffTable />
    </WithAuth>,
  );
}

describe("StaffTable", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParamsRef.current = new URLSearchParams("");
  });

  it("labels each row with its level in words, not its role", async () => {
    stubStaff([
      makeRow(),
      makeRow({
        id: "owner-1",
        email: "owner@example.com",
        firstName: "Олексій",
        lastName: null,
        role: "ADMIN",
        isOwner: true,
        level: 3,
        permissionCount: 0,
      }),
    ]);
    renderTable();

    expect(
      await screen.findByText(dict.staff.levelManager),
    ).toBeInTheDocument();
    // «Власник» rather than «Адміністратор»: the level is server truth and the
    // owner and a deputy share a role.
    expect(screen.getByText(dict.staff.levelOwner)).toBeInTheDocument();
  });

  /**
   * An administrator's `permissionCount` is 0 and always will be — they pass
   * every guard by level and hold no rows. Printing «0» in the «Права» column
   * would be the list-shaped version of the empty grid the card refuses to show.
   */
  it("prints «Повний доступ» instead of 0 for an account that holds everything by level", async () => {
    stubStaff([
      makeRow({
        id: "deputy-1",
        email: "deputy@example.com",
        role: "ADMIN",
        level: 2,
        permissionCount: 0,
      }),
    ]);
    renderTable();

    expect(
      await screen.findByText(dict.staff.permissionsFullAccess),
    ).toBeInTheDocument();
  });

  it("says «ще не входив» rather than printing an empty cell", async () => {
    stubStaff([makeRow({ lastSeenAt: null })]);
    renderTable();

    expect(
      await screen.findByText(dict.staff.lastSeenNever),
    ).toBeInTheDocument();
  });

  /**
   * `AdminUserTable` explains why accounts have no bulk select. Here the reason
   * is sharper: this list is ONLY the people who can enter the panel, so one
   * mis-clicked bulk deactivate is the shop with nobody able to sign in — and the
   * server's guard is per-target, so such a call would half-succeed.
   */
  it("offers no row selection", async () => {
    stubStaff([makeRow()]);
    renderTable();

    await screen.findByText("Олена Коваль");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("offers the hiring CTA from the empty state, where the answer is obvious", async () => {
    stubStaff([]);
    renderTable();

    expect(await screen.findByText(dict.staff.emptyAll)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.staff.create }),
    ).toBeInTheDocument();
  });
});
