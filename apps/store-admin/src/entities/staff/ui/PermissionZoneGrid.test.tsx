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

  /**
   * Д-ж2 (StaffProposal С3): every zone used to open collapsed, so the card of
   * a manager with eight rights showed eight zone headers and none of the
   * rights. Zones that HOLD something open on arrival; empty ones stay folded.
   * Decided once, on mount — unticking the last box of a zone must not snap it
   * shut under the pointer.
   */
  it("opens the zones that hold a right and keeps empty ones collapsed", async () => {
    const twoZones: ZoneGroup[] = [
      ...groups,
      {
        zone: "content",
        label: "Контент і блог",
        permissions: [
          { key: "pages:write", zone: "content", label: "Редагувати сторінки" },
        ],
      },
    ];
    const onToggle = jest.fn();
    const { rerender } = renderWithProviders(
      <PermissionZoneGrid
        groups={twoZones}
        granted={new Set(["orders:read"])}
        onToggle={onToggle}
        onToggleZone={() => {}}
        idPrefix="test"
      />,
    );

    expect(
      screen.getByRole("button", {
        name: dict.staff.zoneCollapseAria("Замовлення"),
      }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Переглядати замовлення")).toBeChecked();
    expect(
      screen.getByRole("button", {
        name: dict.staff.zoneExpandAria("Контент і блог"),
      }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByLabelText("Редагувати сторінки"),
    ).not.toBeInTheDocument();

    // Unticking the zone's only granted right leaves it open.
    await userEvent.click(screen.getByLabelText("Переглядати замовлення"));
    expect(onToggle).toHaveBeenCalledWith("orders:read");
    rerender(
      <PermissionZoneGrid
        groups={twoZones}
        granted={new Set<string>()}
        onToggle={onToggle}
        onToggleZone={() => {}}
        idPrefix="test"
      />,
    );
    expect(screen.getByLabelText("Переглядати замовлення")).not.toBeChecked();
    expect(screen.getByLabelText("Повертати гроші")).toBeInTheDocument();
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
