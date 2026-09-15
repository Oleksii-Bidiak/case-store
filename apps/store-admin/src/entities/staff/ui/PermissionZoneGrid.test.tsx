import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { PermissionZoneGrid } from "./PermissionZoneGrid";
import type { ZoneGroup } from "../model/permission-zones";

const groups: ZoneGroup[] = [
  {
    zone: "orders",
    label: "Замовлення",
    permissions: [
      { key: "orders:read", zone: "orders", label: "Переглядати замовлення" },
      { key: "payments:refund", zone: "orders", label: "Повертати гроші" },
    ],
  },
];

function render(
  overrides: {
    granted?: string[];
    permissionsWithoutRoutes?: ReadonlySet<string>;
    onToggle?: (key: string) => void;
    onToggleZone?: (group: ZoneGroup, grant: boolean) => void;
  } = {},
) {
  return renderWithProviders(
    <PermissionZoneGrid
      groups={groups}
      granted={new Set(overrides.granted ?? [])}
      onToggle={overrides.onToggle ?? (() => {})}
      onToggleZone={overrides.onToggleZone ?? (() => {})}
      idPrefix="test"
      permissionsWithoutRoutes={overrides.permissionsWithoutRoutes}
    />,
  );
}

describe("PermissionZoneGrid", () => {
  it("summarises a zone as «немає» / partial / «усі» without expanding it", () => {
    const { rerender } = render();
    expect(screen.getByText(dict.staff.zoneNone)).toBeInTheDocument();

    rerender(
      <PermissionZoneGrid
        groups={groups}
        granted={new Set(["orders:read"])}
        onToggle={() => {}}
        onToggleZone={() => {}}
        idPrefix="test"
      />,
    );
    expect(screen.getByText(dict.staff.zonePartial(1, 2))).toBeInTheDocument();

    rerender(
      <PermissionZoneGrid
        groups={groups}
        granted={new Set(["orders:read", "payments:refund"])}
        onToggle={() => {}}
        onToggleZone={() => {}}
        idPrefix="test"
      />,
    );
    expect(screen.getByText(dict.staff.zoneAll)).toBeInTheDocument();
  });

  it("reports a single tick to the caller by key", async () => {
    const onToggle = jest.fn();
    render({ onToggle });

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.staff.zoneExpandAria("Замовлення"),
      }),
    );
    await userEvent.click(
      await screen.findByLabelText("Переглядати замовлення"),
    );

    expect(onToggle).toHaveBeenCalledWith("orders:read");
  });

  /**
   * A checkbox that grants nothing is worse than a missing checkbox: the owner
   * ticks «Повертати гроші», believes the refund desk is delegated, and learns
   * months later that the manager was hitting 403 the whole time.
   *
   * The live set is EMPTY today and that is the correct steady state, so this
   * test injects one — a test bound to the real constant would silently stop
   * asserting anything and the badge would rot until the next time somebody
   * shipped a permission ahead of its endpoint.
   */
  it("badges a permission that no endpoint actually requires", async () => {
    render({ permissionsWithoutRoutes: new Set(["payments:refund"]) });

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.staff.zoneExpandAria("Замовлення"),
      }),
    );

    expect(
      await screen.findByText(dict.staff.badgeNoRoute),
    ).toBeInTheDocument();
  });

  it("badges nothing when every permission has a route — the state today", async () => {
    render();

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.staff.zoneExpandAria("Замовлення"),
      }),
    );
    await screen.findByLabelText("Повертати гроші");

    expect(screen.queryByText(dict.staff.badgeNoRoute)).not.toBeInTheDocument();
  });
});
