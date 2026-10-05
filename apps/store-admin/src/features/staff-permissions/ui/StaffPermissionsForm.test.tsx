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

    // The zone holds a right, so it is already open: tick the second one.
    await userEvent.click(
      await screen.findByLabelText("Змінювати статуси та ТТН"),
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.staff.permissionsSave }),
    );

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual(["orders:read", "orders:write"]);
  });

  it("names the template when the SAVED set matches exactly one", async () => {
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

  it("keeps naming it while an edit is UNSAVED — the badge describes rights, not a draft", async () => {
    // `matchingTemplate` reads the SERVER set on purpose, not the tick state. The
    // badge answers «що ця людина може», and until Save that is still the
    // template's set — a badge that flickered off on every tick would report a
    // permission change that has not happened. The name of this test used to
    // promise the opposite, which is worth pinning rather than leaving to the
    // next reader to re-derive from the `useMemo` dependencies.
    stubPermissions({ permissions: ["orders:read", "orders:write"] });
    stubTemplates([
      {
        id: "t1",
        name: "Оператор замовлень",
        permissions: ["orders:read", "orders:write"],
      },
    ]);
    render();

    await screen.findByText(dict.staff.templateMatch("Оператор замовлень"));

    await userEvent.click(
      await screen.findByLabelText("Змінювати статуси та ТТН"),
    );

    expect(
      screen.getByText(dict.staff.templateMatch("Оператор замовлень")),
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

/**
 * Д-ж2 (StaffProposal С3): the save row is the sticky bar every long admin form
 * uses, and it SAYS what is about to change — «Змінено 2 права: + …, − …» — so
 * a revocation is never one unnoticed untick away from being saved.
 */
describe("StaffPermissionsForm — sticky save bar", () => {
  it("lists the pending changes by name, and «Скасувати зміни» puts the boxes back", async () => {
    stubPermissions({ permissions: ["orders:read"] });
    stubTemplates();
    const { container } = render();
    await screen.findByText("Замовлення");

    expect(container.querySelector('[data-variant="sticky"]')).not.toBeNull();
    // Nothing to save yet.
    expect(
      screen.getByRole("button", { name: dict.staff.permissionsSave }),
    ).toBeDisabled();

    await userEvent.click(screen.getByLabelText("Змінювати статуси та ТТН"));
    await userEvent.click(screen.getByLabelText("Переглядати замовлення"));

    expect(
      screen.getByText(
        dict.staff.permissionsChanged(
          2,
          "+ Змінювати статуси та ТТН, − Переглядати замовлення",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.staff.permissionsSave }),
    ).toBeEnabled();

    await userEvent.click(
      screen.getByRole("button", { name: dict.canon.discardChanges }),
    );
    expect(screen.getByLabelText("Переглядати замовлення")).toBeChecked();
    expect(screen.getByLabelText("Змінювати статуси та ТТН")).not.toBeChecked();
    expect(screen.queryByText(/^Змінено/)).not.toBeInTheDocument();
  });

  it("agrees the count with its noun — «Змінено 1 право», «5 прав»", () => {
    expect(dict.staff.permissionsChanged(1, "+ A")).toBe(
      "Змінено 1 право: + A",
    );
    expect(dict.staff.permissionsChanged(5, "x")).toBe("Змінено 5 прав: x");
  });

  /**
   * The template applier must not disappear with the redesign: the API does not
   * say which template a person was given (TASK-445 stores no link), so the
   * artboard's «Шаблон … · змінено» banner cannot be drawn honestly yet — the
   * existing «Застосувати шаблон» control stays, and still uses the apply route.
   */
  it("still applies a template through the apply route", async () => {
    stubPermissions({ permissions: ["orders:read"] });
    stubTemplates([
      {
        id: "t1",
        name: "Оператор замовлень",
        permissions: ["orders:read", "orders:write"],
      },
    ]);
    const applied: string[] = [];
    server.use(
      http.post(
        "*/api/admin/permission-templates/:id/apply",
        async ({ params }) => {
          applied.push(String(params.id));
          return HttpResponse.json({
            data: {
              template: { id: "t1", name: "Оператор замовлень" },
              userId: "manager-1",
              before: ["orders:read"],
              after: ["orders:read", "orders:write"],
            },
          });
        },
      ),
    );
    render();

    await userEvent.click(
      await screen.findByRole("combobox", {
        name: dict.staff.templateApplyAria,
      }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Оператор замовлень" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.staff.templateApplySubmit }),
    );

    await waitFor(() => expect(applied).toEqual(["t1"]));
  });

  it("draws no save bar for a reader who may not write", async () => {
    stubPermissions({ permissions: ["orders:read"] });
    stubTemplates();
    const { container } = render(false);

    await screen.findByText(dict.staff.permissionsReadOnly);
    expect(container.querySelector('[data-variant="sticky"]')).toBeNull();
  });
});
