import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, within } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminProfileView } from "./AdminProfileView";

const d = dict.profile;

/** The server's answer for a manager — keys plus their catalogue labels. */
function stubMyPermissions(
  permissions: string[],
  entries: Array<{ key: string; label: string }>,
) {
  server.use(
    http.get("*/api/auth/me/permissions", () =>
      HttpResponse.json({
        data: {
          role: "MANAGER",
          isOwner: false,
          isAdmin: false,
          permissions,
          entries,
        },
      }),
    ),
  );
}

function permissionsList(): HTMLElement {
  const section = screen
    .getByRole("heading", { name: d.permissionsSection })
    .closest("section");
  if (!section) throw new Error("permissions section not found");
  return within(section).getByRole("list");
}

describe("AdminProfileView — «Ваші права» (TASK-725)", () => {
  it("shows Ukrainian labels from the catalogue instead of raw keys", async () => {
    stubMyPermissions(
      ["orders:read", "products:read"],
      [
        { key: "orders:read", label: "Переглядати замовлення" },
        { key: "products:read", label: "Переглядати товари" },
      ],
    );

    renderWithProviders(<AdminProfileView />, {
      auth: { permissions: ["products:read", "orders:read"] },
    });

    expect(
      await screen.findByText("Переглядати замовлення"),
    ).toBeInTheDocument();
    expect(screen.getByText("Переглядати товари")).toBeInTheDocument();
    const items = within(permissionsList()).getAllByRole("listitem");
    // Catalogue order (the server's), not alphabetical by key.
    expect(items.map((item) => item.textContent)).toEqual([
      "Переглядати замовлення",
      "Переглядати товари",
    ]);
    expect(screen.queryByText("orders:read")).not.toBeInTheDocument();
    expect(screen.queryByText("products:read")).not.toBeInTheDocument();
  });

  it("falls back to the key for a permission the server did not label", async () => {
    stubMyPermissions(
      ["orders:read", "zz:retired"],
      [{ key: "orders:read", label: "Переглядати замовлення" }],
    );

    renderWithProviders(<AdminProfileView />, {
      auth: { permissions: ["orders:read", "zz:retired"] },
    });

    expect(
      await screen.findByText("Переглядати замовлення"),
    ).toBeInTheDocument();
    expect(screen.getByText("zz:retired")).toBeInTheDocument();
  });

  it("never labels a key the session does not hold", async () => {
    // The context is the source of truth for WHAT is held; the entries only
    // name it. A stale cached answer must not add a right to the screen.
    stubMyPermissions(
      ["orders:read", "orders:write"],
      [
        { key: "orders:read", label: "Переглядати замовлення" },
        { key: "orders:write", label: "Змінювати статуси та ТТН" },
      ],
    );

    renderWithProviders(<AdminProfileView />, {
      auth: { permissions: ["orders:read"] },
    });

    expect(
      await screen.findByText("Переглядати замовлення"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Змінювати статуси та ТТН"),
    ).not.toBeInTheDocument();
  });

  it("tells the owner they hold everything instead of listing rights", () => {
    renderWithProviders(<AdminProfileView />, { auth: { isOwner: true } });

    expect(screen.getByText(d.permissionsOwner)).toBeInTheDocument();
  });

  it("says so when a manager holds nothing", () => {
    stubMyPermissions([], []);

    renderWithProviders(<AdminProfileView />, { auth: { permissions: [] } });

    expect(screen.getByText(d.permissionsEmpty)).toBeInTheDocument();
  });

  it("tells a manager where more rights come from", async () => {
    stubMyPermissions(
      ["orders:read"],
      [{ key: "orders:read", label: "Переглядати замовлення" }],
    );

    renderWithProviders(<AdminProfileView />, {
      auth: { permissions: ["orders:read"] },
    });

    expect(await screen.findByText(d.permissionsMoreHint)).toBeInTheDocument();
  });

  it("shows no such hint to the owner", () => {
    renderWithProviders(<AdminProfileView />, { auth: { isOwner: true } });

    expect(screen.queryByText(d.permissionsMoreHint)).not.toBeInTheDocument();
  });

  // A deputy admin holds `staff:read`, so the grantable catalogue — the one
  // source of zones — is theirs to read; the rights are grouped under it.
  it("groups the rights by zone when the catalogue's zones are available", async () => {
    stubMyPermissions(
      ["orders:read", "customers:read", "staff:read"],
      [
        { key: "orders:read", label: "Переглядати замовлення" },
        { key: "customers:read", label: "Картки клієнтів" },
        { key: "staff:read", label: "Переглядати службові акаунти" },
      ],
    );
    server.use(
      http.get("*/api/admin/staff/:id/permissions", () =>
        HttpResponse.json({
          data: {
            userId: "admin-1",
            email: "staff@example.com",
            role: "ADMIN",
            level: 2,
            holdsEverythingByLevel: true,
            permissions: [],
            catalogue: [
              {
                key: "orders:read",
                zone: "orders",
                label: "Переглядати замовлення",
              },
              {
                key: "customers:read",
                zone: "customers",
                label: "Картки клієнтів",
              },
            ],
            zones: [
              { zone: "orders", label: "Замовлення" },
              { zone: "customers", label: "Клієнти (персональні дані)" },
            ],
          },
        }),
      ),
    );

    renderWithProviders(<AdminProfileView />, {
      auth: {
        isAdmin: true,
        permissions: ["orders:read", "customers:read", "staff:read"],
      },
    });

    const orders = await screen.findByRole("heading", { name: "Замовлення" });
    expect(
      within(orders.closest("div")!).getByText("Переглядати замовлення"),
    ).toBeInTheDocument();
    const customers = screen.getByRole("heading", {
      name: "Клієнти (персональні дані)",
    });
    expect(
      within(customers.closest("div")!).getByText("Картки клієнтів"),
    ).toBeInTheDocument();
    // Not in the grantable catalogue → its own trailing group, never dropped.
    expect(
      screen.getByText("Переглядати службові акаунти"),
    ).toBeInTheDocument();
  });
});

describe("AdminProfileView — «Акаунт» (TASK-1055)", () => {
  beforeEach(() => {
    // A deputy admin reads the grantable catalogue for the zone headings.
    server.use(
      http.get("*/api/admin/staff/:id/permissions", () =>
        HttpResponse.json({
          data: {
            userId: "admin-1",
            email: "staff@example.com",
            role: "ADMIN",
            level: 2,
            holdsEverythingByLevel: true,
            permissions: [],
            catalogue: [],
            zones: [],
          },
        }),
      ),
    );
  });

  it("names the owner «Власник магазину», not «Адміністратор»", () => {
    renderWithProviders(<AdminProfileView />, { auth: { isOwner: true } });

    expect(screen.getByText(d.levelOwner)).toBeInTheDocument();
    expect(screen.queryByText(dict.staff.levelAdmin)).not.toBeInTheDocument();
  });

  it.each([
    ["a deputy admin", { isAdmin: true }, dict.staff.levelAdmin],
    ["a manager", {}, dict.staff.levelManager],
  ])("names the level of %s", (_who, auth, label) => {
    renderWithProviders(<AdminProfileView />, { auth });

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("shows the person's name from their profile", async () => {
    renderWithProviders(<AdminProfileView />, { auth: { isOwner: true } });

    // The shared /users/me stub answers «Admin User».
    expect(await screen.findByText("Admin User")).toBeInTheDocument();
    expect(screen.getByText(d.fieldName)).toBeInTheDocument();
  });

  it("offers to copy the ID, shown in one monospace size", () => {
    renderWithProviders(<AdminProfileView />, {
      auth: { isOwner: true, userId: "3f9c2a7e" },
    });

    const id = screen.getByText("3f9c2a7e");
    expect(id).toHaveClass("font-mono", "text-pill");
    expect(id).not.toHaveClass("text-sm");
    expect(
      screen.getByRole("button", { name: d.copyIdAria }),
    ).toBeInTheDocument();
  });

  it("shows the email", () => {
    renderWithProviders(<AdminProfileView />, {
      auth: { isOwner: true, email: "owner@store.ua" },
    });

    expect(screen.getByText("owner@store.ua")).toBeInTheDocument();
  });
});
