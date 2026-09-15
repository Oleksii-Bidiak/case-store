import { groupByZone, matchingTemplate } from "./permission-zones";
import type {
  GrantablePermissionEntry,
  PermissionTemplateEntity,
  PermissionZoneEntry,
} from "@/shared/api";

const catalogue: GrantablePermissionEntry[] = [
  { key: "orders:read", zone: "orders", label: "Переглядати замовлення" },
  { key: "products:read", zone: "catalog", label: "Переглядати товари" },
  { key: "orders:write", zone: "orders", label: "Змінювати статуси" },
  { key: "mystery:key", zone: "nowhere", label: "Щось нове" },
];

const zones: PermissionZoneEntry[] = [
  { zone: "orders", label: "Замовлення" },
  { zone: "catalog", label: "Каталог і ціни" },
  // A zone the catalogue has nothing in: it must not produce an empty heading.
  { zone: "settings", label: "Налаштування сайту" },
];

function template(
  id: string,
  name: string,
  permissions: string[],
): PermissionTemplateEntity {
  return {
    id,
    name,
    description: null,
    permissions,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("groupByZone", () => {
  it("orders the groups the way the API lists the zones, not the catalogue", () => {
    const groups = groupByZone(catalogue, zones);

    expect(groups.map((group) => group.zone)).toEqual([
      "orders",
      "catalog",
      // The unknown zone is APPENDED, never dropped — see the function's note:
      // silently hiding a permission would make "granted to nobody" look like a
      // deliberate decision.
      "nowhere",
    ]);
    expect(groups[0].permissions.map((entry) => entry.key)).toEqual([
      "orders:read",
      "orders:write",
    ]);
  });

  it("labels an unknown zone with its raw key rather than inventing one", () => {
    const groups = groupByZone(catalogue, zones);
    const unknown = groups.find((group) => group.zone === "nowhere");

    expect(unknown?.label).toBe("nowhere");
  });

  it("emits no heading for a declared zone the catalogue does not fill", () => {
    const groups = groupByZone(catalogue, zones);

    expect(groups.some((group) => group.zone === "settings")).toBe(false);
  });
});

describe("matchingTemplate", () => {
  const operator = template("t1", "Оператор замовлень", [
    "orders:read",
    "orders:write",
  ]);
  const content = template("t2", "Контент-менеджер", ["blog:write"]);

  it("reports a template whose set is exactly what the person holds", () => {
    // Order must not matter — a template is a SET.
    expect(
      matchingTemplate(["orders:write", "orders:read"], [operator, content]),
    ).toBe(operator);
  });

  it("reports nothing once one extra permission is ticked on top", () => {
    // The whole point of the copy semantic: after any hand edit the person is
    // simply not "on" a template any more, and a near-miss label would be false
    // reassurance.
    expect(
      matchingTemplate(
        ["orders:read", "orders:write", "blog:write"],
        [operator, content],
      ),
    ).toBeNull();
  });

  it("reports nothing for somebody holding no permissions at all", () => {
    expect(matchingTemplate([], [operator, content])).toBeNull();
  });
});
