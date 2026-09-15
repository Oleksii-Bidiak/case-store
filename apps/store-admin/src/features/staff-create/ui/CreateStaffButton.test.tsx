import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
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
