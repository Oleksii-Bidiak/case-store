import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { OrderCreateForm } from "./order-create-form";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

/**
 * The operator's create-order form (TASK-341), as TASK-426 left it.
 *
 * Three things are pinned here, all of them things a phone order used to fail on:
 * no human types a UUID, picking the account fills in the recipient without
 * overwriting the operator, and an unreachable Nova Poshta directory degrades to
 * free text instead of blocking the order.
 */

const CUSTOMER = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  email: "olena@example.com",
  firstName: "Олена",
  lastName: "Шевченко",
  phone: "380501234567",
  role: "CUSTOMER",
  isActive: true,
  emailVerifiedAt: null,
  lockedUntil: null,
  failedLoginAttempts: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function usersRespondWithOlena(): void {
  server.use(
    http.get("*/api/users", () =>
      HttpResponse.json({
        data: [CUSTOMER],
        meta: { total: 1, page: 1, limit: 8, totalPages: 1 },
      }),
    ),
  );
}

/**
 * Read a field by its id.
 *
 * Deliberately not `getByLabelText`: the guest-contact name and the recipient
 * first name are BOTH labelled «Імʼя» (they are different facts about different
 * people), so a label query is ambiguous while both are on screen.
 */
function field(name: string): HTMLInputElement {
  const element = document.getElementById(`order-create-${name}`);
  if (element === null) throw new Error(`No field order-create-${name}`);
  return element as HTMLInputElement;
}

/** Pick the ACCOUNT tab and search for the seeded customer. */
async function pickOlena(user: ReturnType<typeof userEvent.setup>) {
  usersRespondWithOlena();
  await user.click(screen.getByRole("tab", { name: "Існуючий акаунт" }));
  await user.type(screen.getByRole("searchbox", { name: "Клієнт" }), "Олена");
  await user.click(
    await screen.findByRole("button", { name: /Вибрати клієнта/i }),
  );
}

describe("OrderCreateForm — the customer (TASK-426)", () => {
  it("offers a search instead of a UUID field", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderCreateForm />);

    await user.click(screen.getByRole("tab", { name: "Існуючий акаунт" }));

    expect(
      screen.getByRole("searchbox", { name: "Клієнт" }),
    ).toBeInTheDocument();
    // The field that used to live here asked for a customer's UUID and told the
    // operator to copy it from another screen.
    expect(screen.queryByLabelText(/ID користувача/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/^550e8400-/)).not.toBeInTheDocument();
  });

  it("fills the recipient block from the account it was given", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderCreateForm />);

    await pickOlena(user);

    expect(field("firstName")).toHaveValue("Олена");
    expect(field("lastName")).toHaveValue("Шевченко");
    // Exactly the digits the account carries. There is no mask on this field any
    // more: it rewrote every value into a `+380` shape, which made a foreign
    // number impossible to enter — see the phone block below.
    expect(field("phone")).toHaveValue("380501234567");
  });

  it("never overwrites a recipient the operator has already typed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderCreateForm />);

    // "Send it to my sister" is an ordinary instruction on a phone call.
    await user.type(field("firstName"), "Ірина");
    await pickOlena(user);

    expect(field("firstName")).toHaveValue("Ірина");
    // The fields that were still empty are filled, so this is a prefill and not
    // an all-or-nothing copy.
    expect(field("lastName")).toHaveValue("Шевченко");
  });
});

describe("OrderCreateForm — the Nova Poshta directory (TASK-426)", () => {
  it("says the directory is unavailable rather than «нічого не знайдено»", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/api/delivery/cities", () =>
        HttpResponse.json({ message: "NP unavailable" }, { status: 503 }),
      ),
    );
    renderWithProviders(<OrderCreateForm />);

    await user.type(field("city"), "Киї");

    // NP refuses keyless calls, so this is the NORMAL state of a deployment
    // without an NP key — and the order must still be placeable by hand.
    expect(
      await screen.findByText(/Довідник Нової Пошти недоступний/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Нічого не знайдено/i)).not.toBeInTheDocument();
    // The typed value survives: free text is a supported address, not an error.
    expect(field("city")).toHaveValue("Киї");
  });

  it("keeps the branch field on free text until a city is chosen", () => {
    renderWithProviders(<OrderCreateForm />);

    expect(
      screen.getByText(/Спершу оберіть місто, щоб побачити відділення/i),
    ).toBeInTheDocument();
  });

  it("scopes the branch search to the settlement that was picked", async () => {
    const user = userEvent.setup();
    const warehouseQueries: string[] = [];

    server.use(
      http.get("*/api/delivery/cities", () =>
        HttpResponse.json({
          data: [
            {
              ref: "db5c88e0-391c-11dd-90d9-001a92567626",
              name: "Київ",
              area: "Київська",
              warehouses: 900,
            },
          ],
        }),
      ),
      http.get("*/api/delivery/warehouses", ({ request }) => {
        warehouseQueries.push(
          new URL(request.url).searchParams.get("cityRef") ?? "",
        );
        return HttpResponse.json({
          data: [
            {
              ref: "7b422fc6-e1b8-11e3-8c4a-0050568002cf",
              description: "Відділення №12: вул. Хрещатик, 22",
              number: "12",
              typeOfWarehouse: "branch",
            },
          ],
        });
      }),
    );
    renderWithProviders(<OrderCreateForm />);

    await user.type(field("city"), "Київ");
    await user.click(
      await screen.findByRole("button", { name: /Вибрати «Київ»/i }),
    );

    expect(field("city")).toHaveValue("Київ");
    await waitFor(() =>
      expect(warehouseQueries).toContain(
        "db5c88e0-391c-11dd-90d9-001a92567626",
      ),
    );

    // Clicking into the branch field opens the list of that city's branches: with
    // a settlement chosen the list is short and browsable, and an operator reading
    // options out loud should not have to guess a search term first.
    await user.click(field("address1"));
    await user.click(
      await screen.findByRole("button", { name: /Вибрати «Відділення №12/i }),
    );
    expect(field("address1")).toHaveValue("Відділення №12: вул. Хрещатик, 22");
  });
});

describe("OrderCreateForm — the phone fields (TASK-426)", () => {
  /**
   * The regression. Both fields shipped with the `+380` mask, which rewrites
   * every value into a Ukrainian shape and truncates at nine local digits: typing
   * a Polish number produced `+380 48 123 4567`, a different number entirely.
   * The endpoints behind these fields accept any country on purpose (TASK-338,
   * restated by the owner 2026-09-10), so the form must let one be typed.
   */
  it("keeps a foreign number exactly as it was typed, in both phone fields", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderCreateForm />);

    await user.type(field("contactPhone"), "+48 123 456 789");
    await user.type(field("phone"), "+1 (212) 555-0123");

    expect(field("contactPhone")).toHaveValue("+48 123 456 789");
    expect(field("phone")).toHaveValue("+1 (212) 555-0123");
  });

  it("tells the operator the rule that actually applies", () => {
    renderWithProviders(<OrderCreateForm />);

    // The hint used to promise «Український номер: +380 і 9 цифр» on a field the
    // API is deliberately country-agnostic about.
    expect(screen.queryByText(/Український номер/i)).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/номер будь-якої країни/i).length,
    ).toBeGreaterThan(0);
  });
});
