import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
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

/**
 * Untick «Одержувач — той самий клієнт» (wave 198, Н1): the recipient's name
 * and phone are hidden — and copied from the client — until then.
 */
async function showRecipient(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("checkbox", { name: dict.orderCreate.sameRecipient }),
  );
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
    // The recipient is the client by default; the fields are one click away.
    await showRecipient(user);

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
    await showRecipient(user);
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

    await showRecipient(user);
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

describe("OrderCreateForm — the notes say why they block (TASK-794)", () => {
  it("stops typing at each note's limit", () => {
    renderWithProviders(<OrderCreateForm />);

    expect(field("notes")).toHaveAttribute("maxLength", "500");
    expect(field("internal-notes")).toHaveAttribute("maxLength", "2000");
  });

  // `maxLength` governs typing only; a value that arrives another way still
  // meets the schema, and that refusal used to leave the button silently dead.
  it("shows the length error under the field", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderCreateForm />);

    fireEvent.change(field("notes"), { target: { value: "н".repeat(501) } });
    fireEvent.change(field("internal-notes"), {
      target: { value: "н".repeat(2001) },
    });
    await user.click(
      screen.getByRole("button", { name: dict.orderCreate.submit }),
    );

    expect(
      await screen.findByText(dict.orderCreate.notesTooLong),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.orderCreate.internalNotesTooLong),
    ).toBeInTheDocument();
    expect(field("notes")).toHaveAttribute("aria-invalid", "true");
    expect(field("internal-notes")).toHaveAttribute("aria-invalid", "true");
  });

  it("says how far over the limit a note is", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderCreateForm />);

    fireEvent.change(field("internal-notes"), {
      target: { value: "н".repeat(2140) },
    });
    await user.click(
      screen.getByRole("button", { name: dict.orderCreate.submit }),
    );

    expect(
      await screen.findByText(dict.orderCreate.internalNotesTooLong),
    ).toHaveTextContent(dict.orderCreate.tooLongNow(2140));
  });
});

/** Wave 198 (TASK-1047, OrderNewProposal Н1–Н4). */
describe("OrderCreateForm — by mockup (TASK-1047)", () => {
  const t = dict.orderCreate;

  const PRODUCTS = [
    {
      id: "p-1",
      name: "Силіконовий чохол",
      price: "1299",
      sku: "SC-IP15",
      stock: 8,
      reservedQty: 0,
    },
    {
      id: "p-2",
      name: "Чохол без залишку",
      price: "899",
      sku: null,
      stock: 0,
      reservedQty: 0,
    },
  ];

  function serveProducts() {
    server.use(
      http.get("*/api/products/admin/list", () =>
        HttpResponse.json({
          data: PRODUCTS,
          meta: { total: 2, page: 1, limit: 8, totalPages: 1 },
        }),
      ),
    );
  }

  async function addFirstProduct(user: ReturnType<typeof userEvent.setup>) {
    serveProducts();
    await user.type(
      screen.getByRole("searchbox", { name: t.itemsSearchAria }),
      "чохол",
    );
    await user.click(
      await screen.findByRole("button", {
        name: t.itemsAddAria("Силіконовий чохол"),
      }),
    );
  }

  async function fillGuestAndAddress(
    user: ReturnType<typeof userEvent.setup>,
    name = "Оксана Шевченко",
  ) {
    await user.type(field("contactPhone"), "+380 50 318 22 47");
    await user.type(field("contactName"), name);
    server.use(
      http.get("*/api/delivery/cities", () => HttpResponse.json({ data: [] })),
      http.get("*/api/delivery/warehouses", () =>
        HttpResponse.json({ data: [] }),
      ),
    );
    await user.type(field("city"), "Київ");
    await user.type(field("address1"), "Відділення №12");
  }

  it("shows the four numbered sections and the summary beside them", () => {
    renderWithProviders(<OrderCreateForm />);

    for (const title of [
      t.customerHeading,
      t.itemsHeading,
      t.addressHeading,
      t.paymentHeading,
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("complementary", { name: t.summaryHeading }),
    ).toBeInTheDocument();
    // Both actions live in the summary.
    expect(screen.getByRole("button", { name: t.submit })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.cancel })).toBeInTheDocument();
  });

  it("on an empty submit, says «Додайте хоча б один товар» WITH the field errors, and lists them", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderCreateForm />);

    await user.click(screen.getByRole("button", { name: t.submit }));

    expect(await screen.findByText(t.itemsEmpty)).toBeInTheDocument();
    expect(screen.getByText(t.contactNameInvalid)).toBeInTheDocument();
    const summary = screen.getByRole("complementary", {
      name: t.summaryHeading,
    });
    expect(
      within(summary).getByText(t.errorsTitle("5 полів")),
    ).toBeInTheDocument();
    expect(
      within(summary)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      t.contactPhone,
      t.contactName,
      t.itemsHeading,
      t.addressCity,
      t.addressAddress1,
    ]);
    // The recipient is still «the same client»: its errors follow the client's.
    expect(
      screen.getByRole("checkbox", { name: t.sameRecipient }),
    ).toBeChecked();
  });

  it("shows SKU and free stock, and does not let a sold-out product be added", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderCreateForm />);
    serveProducts();

    await user.type(
      screen.getByRole("searchbox", { name: t.itemsSearchAria }),
      "чохол",
    );

    expect(
      await screen.findByText(`${t.itemSku("SC-IP15")} · ${t.itemFree(8)}`),
    ).toBeInTheDocument();
    expect(screen.getByText(t.itemNoStock)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: t.itemsAddAria("Чохол без залишку") }),
    ).toBeDisabled();
  });

  it("changes a line's quantity with −/+ and totals it in the summary", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderCreateForm />);
    await addFirstProduct(user);

    await user.click(
      screen.getByRole("button", {
        name: t.itemsQtyIncrease("Силіконовий чохол"),
      }),
    );

    expect(
      screen.getByRole("spinbutton", {
        name: t.itemsQtyAria("Силіконовий чохол"),
      }),
    ).toHaveValue(2);
    const summary = within(
      screen.getByRole("complementary", { name: t.summaryHeading }),
    );
    expect(summary.getByText(t.summaryPositionsValue(2))).toBeInTheDocument();
    expect(summary.getAllByText(/2\s?598 ₴/).length).toBeGreaterThan(0);
  });

  it("sends the client as the recipient when «той самий клієнт» is ticked", async () => {
    const user = userEvent.setup();
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post("*/api/admin/orders", async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({
          data: { id: "11111111-2222-3333-4444-555555555555" },
          meta: { accessUrl: null },
        });
      }),
    );
    renderWithProviders(<OrderCreateForm />);
    await fillGuestAndAddress(user);
    await addFirstProduct(user);

    await user.click(screen.getByRole("button", { name: t.submit }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].shippingAddress).toMatchObject({
      firstName: "Оксана",
      lastName: "Шевченко",
      phone: "+380 50 318 22 47",
      city: "Київ",
      address1: "Відділення №12",
    });
  });

  it("turns «той самий клієнт» off when the client's name gives no surname", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderCreateForm />);
    await fillGuestAndAddress(user, "Оксана");
    await addFirstProduct(user);

    await user.click(screen.getByRole("button", { name: t.submit }));

    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: t.sameRecipient }),
      ).not.toBeChecked(),
    );
    expect(field("lastName")).toHaveAttribute("aria-invalid", "true");
  });

  it("puts a stock refusal (400) under the line and says so in the summary", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/admin/orders", () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: 'Insufficient stock for "Силіконовий чохол" — 0 available',
            error: "Bad Request",
          },
          { status: 400 },
        ),
      ),
    );
    renderWithProviders(<OrderCreateForm />);
    await fillGuestAndAddress(user);
    await addFirstProduct(user);

    await user.click(screen.getByRole("button", { name: t.submit }));

    expect(await screen.findByText(t.lineStockGone(0))).toBeInTheDocument();
    const summary = within(
      screen.getByRole("complementary", { name: t.summaryHeading }),
    );
    expect(summary.getByText(t.serverErrorTitle)).toBeInTheDocument();
    expect(summary.getByText(t.serverErrorLine)).toBeInTheDocument();
    // The form is kept as it was.
    expect(field("contactName")).toHaveValue("Оксана Шевченко");
  });

  it("chooses the payment method with pills", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderCreateForm />);
    // Card and instalments need a Nova Poshta city from the directory
    // (TASK-1021) — see the matrix block below.
    await pickKyivFromDirectory(user);

    const group = within(
      screen.getByRole("group", { name: t.paymentMethodAria }),
    );
    expect(
      group.getByRole("button", { name: t.methodOnDelivery }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(group.getByRole("button", { name: t.methodOnline }));
    expect(group.getByRole("button", { name: t.methodOnline })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

const KYIV_REF = "db5c88e0-391c-11dd-90d9-001a92567626";

/** Type «Київ» into the city and pick it from the (mocked) NP directory. */
async function pickKyivFromDirectory(user: ReturnType<typeof userEvent.setup>) {
  server.use(
    http.get("*/api/delivery/cities", () =>
      HttpResponse.json({
        data: [
          { ref: KYIV_REF, name: "Київ", area: "Київська", warehouses: 1 },
        ],
      }),
    ),
    http.get("*/api/delivery/warehouses", () =>
      HttpResponse.json({ data: [] }),
    ),
  );
  await user.type(field("city"), "Київ");
  await user.click(
    await screen.findByRole("button", { name: /Вибрати «Київ»/i }),
  );
}

describe("OrderCreateForm — delivery × payment (TASK-1021)", () => {
  const t = dict.orderCreate;

  it("disables card and instalments while no NP city is picked, and says why", () => {
    renderWithProviders(<OrderCreateForm />);

    const group = within(
      screen.getByRole("group", { name: t.paymentMethodAria }),
    );
    const reason = screen.getByText(t.paymentNeedsNpCity);
    for (const label of [t.methodOnline, t.methodInstallments]) {
      const pill = group.getByRole("button", { name: label });
      expect(pill).toBeDisabled();
      expect(pill).toHaveAccessibleDescription(t.paymentNeedsNpCity);
    }
    expect(reason).toHaveAttribute("id", "order-create-payment-reason");
    expect(
      group.getByRole("button", { name: t.methodOnDelivery }),
    ).toBeEnabled();
  });

  it("enables them once a city is picked from the directory", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderCreateForm />);

    await pickKyivFromDirectory(user);

    const group = within(
      screen.getByRole("group", { name: t.paymentMethodAria }),
    );
    expect(group.getByRole("button", { name: t.methodOnline })).toBeEnabled();
    expect(
      group.getByRole("button", { name: t.methodInstallments }),
    ).toBeEnabled();
    expect(screen.queryByText(t.paymentNeedsNpCity)).not.toBeInTheDocument();
  });

  it("falls back to «Оплата при отриманні» when the city is retyped by hand", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderCreateForm />);
    await pickKyivFromDirectory(user);
    const group = within(
      screen.getByRole("group", { name: t.paymentMethodAria }),
    );
    await user.click(group.getByRole("button", { name: t.methodOnline }));

    // Editing the city drops its directory ref — the order becomes OTHER.
    await user.type(field("city"), "щина");

    await waitFor(() =>
      expect(
        group.getByRole("button", { name: t.methodOnDelivery }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    expect(group.getByRole("button", { name: t.methodOnline })).toBeDisabled();
  });

  it("shows the server's delivery refusal as it came", async () => {
    const user = userEvent.setup();
    const message =
      "Для адреси без міста зі списку Нової Пошти вартість доставки ще не відома — оберіть оплату при отриманні або вкажіть місто Нової Пошти";
    server.use(
      http.post("*/api/admin/orders", () =>
        HttpResponse.json(
          {
            statusCode: 400,
            error: "DELIVERY_PAYMENT_NOT_ALLOWED",
            message,
          },
          { status: 400 },
        ),
      ),
      http.get("*/api/products/admin/list", () =>
        HttpResponse.json({
          data: [
            {
              id: "p-1",
              name: "Силіконовий чохол",
              price: "1299",
              sku: "SC-IP15",
              stock: 8,
              reservedQty: 0,
            },
          ],
          meta: { total: 1, page: 1, limit: 8, totalPages: 1 },
        }),
      ),
    );
    renderWithProviders(<OrderCreateForm />);
    await user.type(field("contactPhone"), "+380 50 318 22 47");
    await user.type(field("contactName"), "Оксана Шевченко");
    await pickKyivFromDirectory(user);
    await user.type(field("address1"), "Відділення №12");
    await user.type(
      screen.getByRole("searchbox", { name: t.itemsSearchAria }),
      "чохол",
    );
    await user.click(
      await screen.findByRole("button", {
        name: t.itemsAddAria("Силіконовий чохол"),
      }),
    );

    await user.click(screen.getByRole("button", { name: t.submit }));

    const summary = within(
      screen.getByRole("complementary", { name: t.summaryHeading }),
    );
    expect(await summary.findByText(message)).toBeInTheDocument();
    expect(summary.getByText(t.serverErrorTitle)).toBeInTheDocument();
  });
});
