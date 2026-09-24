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
});
