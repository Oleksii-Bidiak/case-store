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
import { CreateStaffButton } from "./CreateStaffButton";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

/** The wizard reads the catalogue off the CALLER's own staff permissions. */
function stubCatalogue() {
  server.use(
    http.get("*/api/admin/staff/:id/permissions", () =>
      HttpResponse.json({
        data: {
          userId: "admin-1",
          email: "owner@example.com",
          role: "ADMIN",
          level: 3,
          holdsEverythingByLevel: true,
          permissions: [],
          catalogue: [
            {
              key: "orders:read",
              zone: "orders",
              label: "Переглядати замовлення",
            },
          ],
          zones: [{ zone: "orders", label: "Замовлення" }],
        },
      }),
    ),
    http.get("*/api/admin/permission-templates", () =>
      HttpResponse.json({ data: [] }),
    ),
  );
}

/**
 * TASK-406 put this button where the owner would find it; TASK-480 fixed what it
 * opens and who gets to press it.
 *
 * The gate was `isOwner` from TASK-406 until now, which was NARROWER than the API
 * it fronts: `POST /api/admin/staff` has been `staff:write` since TASK-476, so a
 * deputy admin left in charge could not replace a manager who quit. Widening it
 * was only safe together with hiding the one level a deputy cannot assign.
 */
describe("CreateStaffButton", () => {
  it("opens the hiring wizard for the owner", async () => {
    stubCatalogue();
    renderWithProviders(
      <WithAuth isOwner>
        <CreateStaffButton />
      </WithAuth>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: dict.staff.create }),
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(dict.staff.createDescription)).toBeInTheDocument();
  });

  it("renders for a DEPUTY admin — hiring is staff:write, not the owner's reserve", () => {
    renderWithProviders(
      <WithAuth isOwner={false} isAdmin permissions={[]}>
        <CreateStaffButton />
      </WithAuth>,
    );

    expect(
      screen.getByRole("button", { name: dict.staff.create }),
    ).toBeInTheDocument();
  });

  it("offers a deputy no ADMIN level — the API refuses it, so the option is absent", async () => {
    stubCatalogue();
    renderWithProviders(
      <WithAuth isOwner={false} isAdmin permissions={[]}>
        <CreateStaffButton />
      </WithAuth>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: dict.staff.create }),
    );
    await screen.findByRole("dialog");

    expect(screen.getByText(dict.staff.levelManagerOption)).toBeInTheDocument();
    expect(
      screen.queryByText(dict.staff.levelAdminOption),
    ).not.toBeInTheDocument();
    // …and says why, instead of leaving a level the deputy expected simply gone.
    expect(
      screen.getByText(dict.staff.levelAdminOwnerOnly),
    ).toBeInTheDocument();
  });

  /**
   * TASK-638. The wizard used to copy a template's keys on the client and PUT
   * them, so the audit row read `[] → [...]` with no template in it — while three
   * docblocks promised the log would know which template the person started
   * from. Now it APPLIES the template, and PUTs only what was changed on top.
   */
  describe("applying the chosen template (TASK-638)", () => {
    const TEMPLATE = {
      id: "tpl-operator",
      name: "Оператор",
      description: null,
      permissions: ["orders:read"],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };

    function stubHiring() {
      const calls = {
        apply: [] as { id: string; userId: string }[],
        put: [] as string[][],
      };
      stubCatalogue();
      server.use(
        http.get("*/api/admin/permission-templates", () =>
          HttpResponse.json({ data: [TEMPLATE] }),
        ),
        http.post("*/api/admin/staff", () =>
          HttpResponse.json(
            {
              data: {
                id: "new-manager",
                email: "new@example.com",
                firstName: null,
                lastName: null,
                phone: null,
                role: "MANAGER",
                level: 1,
                isOwner: false,
                isActive: true,
                createdAt: "2026-09-25T00:00:00.000Z",
              },
            },
            { status: 201 },
          ),
        ),
        http.post(
          "*/api/admin/permission-templates/:id/apply",
          async ({ params, request }) => {
            const body = (await request.json()) as { userId: string };
            calls.apply.push({ id: String(params.id), userId: body.userId });
            return HttpResponse.json({
              data: {
                template: TEMPLATE,
                userId: body.userId,
                before: [],
                after: TEMPLATE.permissions,
              },
            });
          },
        ),
        http.put("*/api/admin/staff/:id/permissions", async ({ request }) => {
          const body = (await request.json()) as { permissions: string[] };
          calls.put.push(body.permissions);
          return HttpResponse.json({ data: {} });
        }),
      );
      return calls;
    }

    async function walkToPermissions() {
      renderWithProviders(
        <WithAuth isOwner>
          <CreateStaffButton />
        </WithAuth>,
      );
      await userEvent.click(
        screen.getByRole("button", { name: dict.staff.create }),
      );
      await screen.findByRole("dialog");
      await userEvent.type(
        screen.getByLabelText(dict.staff.fieldEmail),
        "new@example.com",
      );
      await userEvent.type(
        screen.getByLabelText(dict.staff.fieldPassword),
        "Str0ng!Passw0rd#2026",
      );
      await userEvent.click(
        screen.getByRole("button", { name: dict.staff.next }),
      );
      await userEvent.click(await screen.findByLabelText(/Оператор/));
      await userEvent.click(
        screen.getByRole("button", { name: dict.staff.next }),
      );
      await screen.findByText(dict.staff.permissionsIntro);
    }

    it("applies the template through the apply route and writes no PUT", async () => {
      const calls = stubHiring();
      await walkToPermissions();

      await userEvent.click(
        screen.getByRole("button", { name: dict.staff.createSubmit }),
      );

      // The wizard closes only once every request it meant to send is done.
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(calls.apply).toEqual([
        { id: "tpl-operator", userId: "new-manager" },
      ]);
      expect(calls.put).toEqual([]);
    });

    it("applies the template, then PUTs only when the ticks were changed on top", async () => {
      const calls = stubHiring();
      await walkToPermissions();

      // Untick the one key the template brought (its zone holds only that key).
      await userEvent.click(
        screen.getByRole("checkbox", { name: /зони «Замовлення»/ }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: dict.staff.createSubmit }),
      );

      await waitFor(() => expect(calls.put).toHaveLength(1));
      expect(calls.apply).toHaveLength(1);
      expect(calls.put).toEqual([[]]);
    });
  });

  it("renders nothing for a manager", () => {
    renderWithProviders(
      <WithAuth isOwner={false} permissions={["orders:read"]}>
        <CreateStaffButton />
      </WithAuth>,
    );

    expect(
      screen.queryByRole("button", { name: dict.staff.create }),
    ).not.toBeInTheDocument();
  });
});
