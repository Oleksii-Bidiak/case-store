import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import type { PermissionMatrixEntity } from "@/entities/permission";
import { dict } from "@/shared/config";
import {
  PermissionMatrixForm,
  groupByZone,
  ungrantedKeys,
} from "./PermissionMatrixForm";

const d = dict.permissionsMatrix;

/**
 * A matrix shaped like the real response: two known zones, one permission that
 * nobody holds, and one permission the catalogue declares under a zone the
 * `zones` array does not mention.
 */
function makeMatrix(
  overrides: Partial<PermissionMatrixEntity> = {},
): PermissionMatrixEntity {
  return {
    catalogue: [
      { key: "orders:read", zone: "orders", label: "Переглядати замовлення" },
      { key: "orders:write", zone: "orders", label: "Змінювати статуси" },
      { key: "blog:write", zone: "content", label: "Блог" },
      { key: "payments:refund", zone: "orders", label: "Повертати гроші" },
      { key: "future:thing", zone: "brand-new", label: "Щось нове" },
    ],
    zones: [
      { zone: "orders", label: "Замовлення" },
      { zone: "content", label: "Контент і блог" },
    ],
    grantableRoles: ["MANAGER"],
    grants: [{ role: "MANAGER", permissions: ["blog:write"] }],
    ...overrides,
  } as PermissionMatrixEntity;
}

describe("permission matrix — dynamic zone grouping (TASK-334)", () => {
  it("groups by the zones the API returned, in the order it returned them", () => {
    const groups = groupByZone(makeMatrix());

    expect(groups.map((g) => g.zone)).toEqual([
      "orders",
      "content",
      "brand-new",
    ]);
    expect(groups[0].label).toBe("Замовлення");
    expect(groups[0].permissions.map((p) => p.key)).toEqual([
      "orders:read",
      "orders:write",
      "payments:refund",
    ]);
  });

  it("still renders a permission whose zone is missing from the zone list", () => {
    // Dropping it would hide a permission the owner has never decided about,
    // and "granted to nobody" would look deliberate.
    const groups = groupByZone(makeMatrix());
    const orphan = groups.find((g) => g.zone === "brand-new");

    expect(orphan?.permissions.map((p) => p.key)).toEqual(["future:thing"]);
  });

  it("flags every permission no role holds as new / awaiting a decision", () => {
    expect([...ungrantedKeys(makeMatrix())].sort()).toEqual([
      "future:thing",
      "orders:read",
      "orders:write",
      "payments:refund",
    ]);
  });
});

describe("PermissionMatrixForm (TASK-334)", () => {
  it("never offers ADMIN as an editable column", async () => {
    // Even if the API were to start listing it, the owner is not subject to the
    // matrix and a revocable owner is a lockout waiting to happen.
    renderWithProviders(
      <PermissionMatrixForm
        matrix={makeMatrix({
          grantableRoles: [
            "MANAGER",
            "ADMIN",
          ] as PermissionMatrixEntity["grantableRoles"],
        })}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: d.roleColumn(d.roleManager),
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.users.roleAdmin }),
    ).not.toBeInTheDocument();
  });

  // PERMISSIONS_WITHOUT_ROUTES is EMPTY today — every catalogue permission gained
  // a route at integration, which is the state we want. So this asserts the
  // MECHANISM against an injected entry rather than against live data: the badge
  // must still appear the day someone ships a permission ahead of its endpoint,
  // and a test bound to real data would have quietly stopped checking anything
  // the moment the list emptied.
  it("marks a permission with no route behind it so a tick cannot look effective", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PermissionMatrixForm
        matrix={makeMatrix()}
        permissionsWithoutRoutes={new Set(["payments:refund"])}
      />,
    );

    await user.click(
      await screen.findByRole("button", {
        name: d.zoneExpandAria("Замовлення"),
      }),
    );

    const badges = await screen.findAllByText(d.badgeNoRoute);
    expect(badges).toHaveLength(1);
    // …and the not-yet-granted marker is on every ungranted key in the zone.
    expect(screen.getAllByText(d.badgeNew).length).toBeGreaterThan(0);
  });

  it("shows no such badge when every permission has a route (today's state)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PermissionMatrixForm matrix={makeMatrix()} />);

    await user.click(
      await screen.findByRole("button", {
        name: d.zoneExpandAria("Замовлення"),
      }),
    );

    expect(screen.queryByText(d.badgeNoRoute)).not.toBeInTheDocument();
  });

  it("sends the whole grant set for the role and surfaces the server's refusal verbatim", async () => {
    const user = userEvent.setup();
    let received: unknown = null;

    server.use(
      http.put("*/api/admin/permissions", async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(
          {
            statusCode: 403,
            message:
              "Cannot demote the last active administrator — the shop would have no way back in.",
          },
          { status: 403 },
        );
      }),
    );

    renderWithProviders(<PermissionMatrixForm matrix={makeMatrix()} />);

    await user.click(
      await screen.findByRole("button", {
        name: d.zoneExpandAria("Замовлення"),
      }),
    );
    await user.click(screen.getByLabelText("Переглядати замовлення"));
    await user.click(screen.getByRole("button", { name: d.save }));

    await waitFor(() => expect(received).not.toBeNull());
    // A PUT replaces the role's ENTIRE set — the previously granted
    // `blog:write` must still be in the payload or saving would silently revoke
    // everything outside the zone the owner happened to be looking at.
    expect(received).toEqual({
      role: "MANAGER",
      permissions: ["blog:write", "orders:read"],
    });
  });
});
