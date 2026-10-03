import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict } from "@/shared/config";
import { CreateStaffButton } from "./CreateStaffButton";

const d = dict.staff;

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

// The label carries the required «*» (aria-hidden), which jsdom still reads.
const EMAIL_NAME = new RegExp(`^${d.fieldEmail}`);

const STRONG_PASSWORD = "Str0ng!Passw0rd#2026";

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

const TEMPLATE = {
  id: "tpl-operator",
  name: "Оператор",
  description: null,
  permissions: ["orders:read"],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

/** Records every write the wizard sends; the create answers 201 by default. */
function stubHiring({ createStatus = 201 }: { createStatus?: number } = {}) {
  const calls = {
    create: [] as Array<Record<string, unknown>>,
    apply: [] as { id: string; userId: string }[],
    put: [] as string[][],
  };
  stubCatalogue();
  server.use(
    http.get("*/api/admin/permission-templates", () =>
      HttpResponse.json({ data: [TEMPLATE] }),
    ),
    http.post("*/api/admin/staff", async ({ request }) => {
      calls.create.push((await request.json()) as Record<string, unknown>);
      if (createStatus !== 201) {
        return HttpResponse.json(
          { message: "conflict", statusCode: createStatus },
          { status: createStatus },
        );
      }
      return HttpResponse.json(
        {
          data: {
            id: "new-staff",
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
      );
    }),
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

async function openWizard(auth: { isOwner?: boolean; isAdmin?: boolean } = {}) {
  renderWithProviders(
    <WithAuth isOwner={auth.isOwner ?? true} isAdmin={auth.isAdmin}>
      <CreateStaffButton />
    </WithAuth>,
  );
  await userEvent.click(screen.getByRole("button", { name: d.create }));
  return screen.findByRole("dialog");
}

/** The step the stepper marks as current. */
function currentStep(dialog: HTMLElement) {
  const list = within(dialog).getByRole("list", { name: d.stepperAria });
  return list.querySelector('[aria-current="step"]');
}

async function fillWho(email = "new@example.com") {
  await userEvent.type(
    screen.getByRole("textbox", { name: EMAIL_NAME }),
    email,
  );
  await userEvent.click(screen.getByRole("button", { name: d.next }));
}

async function pickTemplate(name: string) {
  await userEvent.click(
    await screen.findByRole("combobox", { name: d.fieldTemplate }),
  );
  await userEvent.click(await screen.findByRole("option", { name }));
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
  beforeEach(() => mockPush.mockClear());

  it("opens the hiring wizard for the owner, under its new name «Додати співробітника»", async () => {
    stubCatalogue();
    const dialog = await openWizard();

    expect(
      within(dialog).getByRole("heading", { name: d.createHeading }),
    ).toBeInTheDocument();
    expect(screen.getByText(d.createDescription)).toBeInTheDocument();
    expect(d.create).toBe("Додати співробітника");
  });

  it("renders for a DEPUTY admin — hiring is staff:write, not the owner's reserve", () => {
    renderWithProviders(
      <WithAuth isOwner={false} isAdmin permissions={[]}>
        <CreateStaffButton />
      </WithAuth>,
    );

    expect(screen.getByRole("button", { name: d.create })).toBeInTheDocument();
  });

  it("offers a deputy no ADMIN level — the API refuses it, so the option is absent", async () => {
    stubCatalogue();
    await openWizard({ isOwner: false, isAdmin: true });
    await fillWho();

    expect(
      await screen.findByRole("radio", { name: d.levelManagerOption }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: d.levelAdminOption }),
    ).not.toBeInTheDocument();
    // …and says why, instead of leaving a level the deputy expected simply gone.
    expect(screen.getByText(d.levelAdminOwnerOnly)).toBeInTheDocument();
  });

  it("renders nothing for a manager", () => {
    renderWithProviders(
      <WithAuth isOwner={false} permissions={["orders:read"]}>
        <CreateStaffButton />
      </WithAuth>,
    );

    expect(
      screen.queryByRole("button", { name: d.create }),
    ).not.toBeInTheDocument();
  });

  /**
   * The step chips were three badges in two different colours, and the ADMIN
   * confirmation had no «Крок N з 3» at all. One `Stepper`: the current step is
   * `aria-current="step"`, finished ones are ✓ and say so to a screen reader.
   */
  describe("stepper «Хто → Доступ → Вхід»", () => {
    it("marks the current step and the finished ones", async () => {
      stubCatalogue();
      const dialog = await openWizard();

      expect(currentStep(dialog)).toHaveTextContent(d.stepWho);

      await fillWho();

      expect(currentStep(dialog)).toHaveTextContent(d.stepAccess);
      const who = within(dialog)
        .getByRole("list", { name: d.stepperAria })
        .querySelector('[data-state="done"]');
      expect(who).toHaveTextContent(d.stepWho);
      // The finished step shows what was entered.
      expect(who).toHaveTextContent("new@example.com");
    });
  });

  /** Form canon 1.5: the reason sits under the field, and the field is red. */
  describe("errors under the field", () => {
    it("keeps an invalid email on step one, under the field", async () => {
      stubCatalogue();
      const dialog = await openWizard();

      await fillWho("not-an-email");

      const email = screen.getByRole("textbox", { name: EMAIL_NAME });
      expect(email).toHaveAttribute("aria-invalid", "true");
      expect(email).toHaveAccessibleDescription(
        expect.stringContaining(d.emailInvalid),
      );
      expect(currentStep(dialog)).toHaveTextContent(d.stepWho);
    });

    it("keeps a weak password on the last step, under the field", async () => {
      stubHiring();
      await openWizard();
      await fillWho();
      await userEvent.click(screen.getByRole("button", { name: d.next }));

      await userEvent.type(
        screen.getByLabelText(d.fieldPassword, { exact: false }),
        "weak",
      );
      await userEvent.click(
        screen.getByRole("button", { name: d.createSubmit }),
      );

      const password = screen.getByLabelText(d.fieldPassword, { exact: false });
      expect(password).toHaveAttribute("aria-invalid", "true");
      expect(password).toHaveAccessibleDescription(
        expect.stringContaining(dict.users.passwordWeak),
      );
    });

    it("sends a taken email back to step one and says so under the field", async () => {
      const calls = stubHiring({ createStatus: 409 });
      const dialog = await openWizard();
      await fillWho();
      await userEvent.click(screen.getByRole("button", { name: d.next }));
      await userEvent.type(
        screen.getByLabelText(d.fieldPassword, { exact: false }),
        STRONG_PASSWORD,
      );
      await userEvent.click(
        screen.getByRole("button", { name: d.createSubmit }),
      );

      await waitFor(() => expect(calls.create).toHaveLength(1));
      await waitFor(() =>
        expect(currentStep(dialog)).toHaveTextContent(d.stepWho),
      );
      expect(
        screen.getByRole("textbox", { name: EMAIL_NAME }),
      ).toHaveAccessibleDescription(expect.stringContaining(d.emailTaken));
    });
  });

  /**
   * The ADMIN confirmation is a sub-state of «Доступ», not a fourth step: the
   * stepper says «підтвердіть», and the destructive button only ACKNOWLEDGES —
   * the account is created on the last step, like any other.
   */
  it("confirms an ADMIN on the access step, then creates without any permission writes", async () => {
    const calls = stubHiring();
    const dialog = await openWizard();
    await fillWho();

    await userEvent.click(
      await screen.findByRole("radio", { name: d.levelAdminOption }),
    );
    await userEvent.click(screen.getByRole("button", { name: d.next }));

    expect(currentStep(dialog)).toHaveTextContent(d.stepAccessConfirm);
    expect(screen.getByText(d.adminGain2)).toBeInTheDocument();
    expect(screen.getByText(d.adminUndo)).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: d.promoteConfirm });
    expect(confirm).toHaveAttribute("data-variant", "destructive");

    await userEvent.click(confirm);
    expect(currentStep(dialog)).toHaveTextContent(d.stepLogin);

    await userEvent.type(
      screen.getByLabelText(d.fieldPassword, { exact: false }),
      STRONG_PASSWORD,
    );
    await userEvent.click(screen.getByRole("button", { name: d.createSubmit }));

    await waitFor(() => expect(calls.create).toHaveLength(1));
    expect(calls.create[0]).toMatchObject({
      email: "new@example.com",
      password: STRONG_PASSWORD,
      role: "ADMIN",
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(calls.apply).toEqual([]);
    expect(calls.put).toEqual([]);
  });

  /**
   * TASK-638. The wizard used to copy a template's keys on the client and PUT
   * them, so the audit row read `[] → [...]` with no template in it — while three
   * docblocks promised the log would know which template the person started
   * from. Now it APPLIES the template, and PUTs only what was changed on top.
   */
  describe("applying the chosen template (TASK-638)", () => {
    async function walkToLogin({ untick = false } = {}) {
      await openWizard();
      await fillWho();
      await pickTemplate("Оператор");
      // Picking a template COPIES its keys into the boxes below, right away.
      expect(
        await screen.findByText(d.permissionsCount(1)),
      ).toBeInTheDocument();
      if (untick) {
        // Untick the one key the template brought (its zone holds only that key).
        await userEvent.click(
          screen.getByRole("checkbox", { name: /зони «Замовлення»/ }),
        );
      }
      await userEvent.click(screen.getByRole("button", { name: d.next }));
      await userEvent.type(
        screen.getByLabelText(d.fieldPassword, { exact: false }),
        STRONG_PASSWORD,
      );
    }

    it("summarises who and what access before the account is created", async () => {
      stubHiring();
      await walkToLogin();

      // Once in the finished «Доступ» step, once in the summary above the
      // password — the same words, so the two can never disagree.
      expect(
        screen.getAllByText(
          d.accessSummary(d.levelManager, d.permissionsColumn(1), "Оператор"),
        ),
      ).toHaveLength(2);
      expect(screen.getByText(d.loginHeading)).toBeInTheDocument();
    });

    it("applies the template through the apply route and writes no PUT", async () => {
      const calls = stubHiring();
      await walkToLogin();

      await userEvent.click(
        screen.getByRole("button", { name: d.createSubmit }),
      );

      // The wizard closes only once every request it meant to send is done.
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(calls.apply).toEqual([
        { id: "tpl-operator", userId: "new-staff" },
      ]);
      expect(calls.put).toEqual([]);
      expect(mockPush).toHaveBeenCalledWith("/staff/new-staff");
    });

    it("applies the template, then PUTs only when the ticks were changed on top", async () => {
      const calls = stubHiring();
      await walkToLogin({ untick: true });

      await userEvent.click(
        screen.getByRole("button", { name: d.createSubmit }),
      );

      await waitFor(() => expect(calls.put).toHaveLength(1));
      expect(calls.apply).toHaveLength(1);
      expect(calls.put).toEqual([[]]);
    });
  });
});
