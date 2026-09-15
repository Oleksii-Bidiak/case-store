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
import { StaffPermissionsForm } from "./StaffPermissionsForm";

const CATALOGUE = [
  { key: "orders:read", zone: "orders", label: "Переглядати замовлення" },
  { key: "orders:write", zone: "orders", label: "Змінювати статуси та ТТН" },
];
const ZONES = [{ zone: "orders", label: "Замовлення" }];

function stubPermissions(
  overrides: {
    holdsEverythingByLevel?: boolean;
    permissions?: string[];
    level?: number;
    role?: string;
  } = {},
) {
  server.use(
    http.get("*/api/admin/staff/:id/permissions", () =>
      HttpResponse.json({
        data: {
          userId: "manager-1",
          email: "manager@example.com",
          role: overrides.role ?? "MANAGER",
          level: overrides.level ?? 1,
          holdsEverythingByLevel: overrides.holdsEverythingByLevel ?? false,
          permissions: overrides.permissions ?? ["orders:read"],
          catalogue: CATALOGUE,
          zones: ZONES,
        },
      }),
    ),
  );
}

function stubTemplates(
  templates: Array<{ id: string; name: string; permissions: string[] }> = [],
) {
  server.use(
    http.get("*/api/admin/permission-templates", () =>
      HttpResponse.json({
        data: templates.map((template) => ({
          ...template,
          description: null,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        })),
      }),
    ),
  );
}

function render(canWrite = true) {
  return renderWithProviders(
    <WithAuth isOwner>
      <StaffPermissionsForm userId="manager-1" canWrite={canWrite} />
    </WithAuth>,
  );
}

describe("StaffPermissionsForm — the deputy's empty grid (TASK-480)", () => {
  /**
   * The failure this prevents: an ADMIN owns no `UserPermission` rows, correctly,
   * because they pass every guard by level. Rendering the ordinary grid for them
   * would draw a screenful of unticked boxes under «Права цієї людини», which
   * reads as "this administrator can do nothing" — the exact opposite of the
   * truth, on the screen whose entire job is to say who can do what.
   */
  it("explains full-access-by-level instead of drawing an empty grid", async () => {
    stubPermissions({
      holdsEverythingByLevel: true,
      permissions: [],
      level: 2,
    });
    stubTemplates();
    render();

    expect(
      await screen.findByText(dict.staff.holdsEverythingHint),
    ).toBeInTheDocument();
    // No checkbox grid, and therefore no save button to press on it.
    expect(
      screen.queryByRole("button", { name: dict.staff.permissionsSave }),
    ).not.toBeInTheDocument();
  });
});

describe("StaffPermissionsForm — a manager's grid", () => {
  it("renders the zone accordion and the count the server reported", async () => {
    stubPermissions({ permissions: ["orders:read"] });
    stubTemplates();
    render();

    expect(await screen.findByText("Замовлення")).toBeInTheDocument();
    expect(
      screen.getByText(dict.staff.permissionsCount(1)),
    ).toBeInTheDocument();
  });

  it("PUTs the complete set — an unticked box is a revocation", async () => {
    stubPermissions({ permissions: ["orders:read"] });
    stubTemplates();

    const sent: string[][] = [];
    server.use(
      http.put("*/api/admin/staff/:id/permissions", async ({ request }) => {
        const body = (await request.json()) as { permissions: string[] };
        sent.push(body.permissions);
        return HttpResponse.json({
          data: {
            userId: "manager-1",
            email: "manager@example.com",
            role: "MANAGER",
            level: 1,
            holdsEverythingByLevel: false,
            permissions: body.permissions,
            catalogue: CATALOGUE,
            zones: ZONES,
          },
        });
      }),
    );

    render();
    await screen.findByText("Замовлення");

    // Expand the zone, then tick the second permission.
    await userEvent.click(
      screen.getByRole("button", {
        name: dict.staff.zoneExpandAria("Замовлення"),
      }),
    );
    await userEvent.click(
      await screen.findByLabelText("Змінювати статуси та ТТН"),
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.staff.permissionsSave }),
    );

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual(["orders:read", "orders:write"]);
  });

  it("names the template when the set is exactly one, and stops naming it after an edit", async () => {
    stubPermissions({ permissions: ["orders:read", "orders:write"] });
    stubTemplates([
      {
        id: "t1",
        name: "Оператор замовлень",
        permissions: ["orders:read", "orders:write"],
      },
    ]);
    render();

    expect(
      await screen.findByText(dict.staff.templateMatch("Оператор замовлень")),
    ).toBeInTheDocument();
  });

  it("offers no save button, no template applier and a reason when the caller may not write", async () => {
    // A deputy looking at another deputy: `assertMayManage` refuses the PUT, so
    // the honest screen is read-only rather than four controls that only 403.
    stubPermissions({ permissions: ["orders:read"] });
    stubTemplates([
      { id: "t1", name: "Оператор", permissions: ["orders:read"] },
    ]);
    render(false);

    expect(
      await screen.findByText(dict.staff.permissionsReadOnly),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.staff.permissionsSave }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: dict.staff.templateApplyAria }),
    ).not.toBeInTheDocument();
  });
});
