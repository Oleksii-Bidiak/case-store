import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict } from "@/shared/config";
import { StaffDetailView } from "./StaffDetailView";

const d = dict.staff;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

function person(overrides: Record<string, unknown> = {}) {
  return {
    id: "target-1",
    email: "iryna@example.com",
    firstName: "Ірина",
    lastName: "Мельничук",
    phone: null,
    role: "MANAGER",
    isOwner: false,
    level: 1,
    isActive: true,
    permissionCount: 1,
    lastSeenAt: null,
    emailVerifiedAt: null,
    lockedUntil: null,
    failedLoginAttempts: 0,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

function stubCard(target: Record<string, unknown>) {
  server.use(
    http.get("*/api/admin/staff/:id", () =>
      HttpResponse.json({ data: target }),
    ),
    http.get("*/api/admin/staff/:id/permissions", () =>
      HttpResponse.json({
        data: {
          userId: target.id,
          email: target.email,
          role: target.role,
          level: target.level,
          holdsEverythingByLevel: Number(target.level) >= 2,
          permissions: [],
          catalogue: [],
          zones: [],
        },
      }),
    ),
    http.get("*/api/admin/permission-templates", () =>
      HttpResponse.json({ data: [] }),
    ),
  );
}

async function openMenu() {
  await userEvent.click(
    await screen.findByRole("button", {
      name: dict.common.registry.rowActionsAria("Ірина Мельничук"),
    }),
  );
}

/**
 * StaffProposal С3: the card's header carries the person's badges and a «⋯»
 * with the account actions — the SAME doors as the «Акаунт» tab, behind the
 * same gates, one click closer. Nothing new is offered and nothing is removed.
 */
describe("StaffDetailView — header «⋯»", () => {
  it("offers the owner every account action on a manager, but no ownership transfer", async () => {
    stubCard(person());
    renderWithProviders(
      <WithAuth isOwner userId="owner-1">
        <StaffDetailView userId="target-1" />
      </WithAuth>,
    );

    await openMenu();

    expect(
      await screen.findByRole("menuitem", { name: d.statusDeactivate }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: d.passwordResetOpen }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: d.deleteHeading }),
    ).toBeInTheDocument();
    // The API refuses a transfer to a manager, so it is not offered.
    expect(
      screen.queryByRole("menuitem", { name: d.transferOpen }),
    ).not.toBeInTheDocument();
  });

  it("offers the owner the transfer on an active administrator", async () => {
    stubCard(person({ role: "ADMIN", level: 2 }));
    renderWithProviders(
      <WithAuth isOwner userId="owner-1">
        <StaffDetailView userId="target-1" />
      </WithAuth>,
    );

    await openMenu();

    expect(
      await screen.findByRole("menuitem", { name: d.transferOpen }),
    ).toBeInTheDocument();
  });

  it("opens the same delete dialog the «Акаунт» tab opens", async () => {
    stubCard(person());
    renderWithProviders(
      <WithAuth isOwner userId="owner-1">
        <StaffDetailView userId="target-1" />
      </WithAuth>,
    );

    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.deleteHeading }),
    );

    expect(
      await screen.findByText(d.deleteDescription("iryna@example.com")),
    ).toBeInTheDocument();
  });

  it("draws no «⋯» for a deputy looking at another deputy — every door would 403", async () => {
    stubCard(person({ role: "ADMIN", level: 2 }));
    renderWithProviders(
      <WithAuth isOwner={false} isAdmin userId="deputy-2">
        <StaffDetailView userId="target-1" />
      </WithAuth>,
    );

    await screen.findByRole("heading", { name: "Ірина Мельничук" });
    expect(
      screen.queryByRole("button", {
        name: dict.common.registry.rowActionsAria("Ірина Мельничук"),
      }),
    ).not.toBeInTheDocument();
  });

  it("shows the canon badges — «Вимкнено» grey, not a red «Неактивний»", async () => {
    stubCard(person({ isActive: false }));
    renderWithProviders(
      <WithAuth isOwner userId="owner-1">
        <StaffDetailView userId="target-1" />
      </WithAuth>,
    );

    expect(await screen.findByText(d.statusOff)).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(screen.getByText(d.levelManager)).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(screen.getByRole("link", { name: d.back })).toHaveAttribute(
      "href",
      "/staff",
    );
  });
});
