import type { ComponentProps } from "react";
import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { OrderCustomerPicker } from "./order-customer-picker";
import type { PickedCustomer } from "../model/create-order-schema";

/**
 * The customer picker for an operator-created order (TASK-426).
 *
 * It replaces a text field that asked for a customer's UUID and a hint telling the
 * operator to go to another screen and copy it. The behaviour worth pinning is
 * therefore: a search finds people by name, a pick hands back the ACCOUNT (not a
 * typed string), a deactivated account cannot be picked, and a failed lookup is not
 * reported as "nobody found".
 */

const makeUser = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});

function respondWith(users: Array<Record<string, unknown>>): void {
  server.use(
    http.get("*/api/users", () =>
      HttpResponse.json({
        data: users,
        meta: { total: users.length, page: 1, limit: 8, totalPages: 1 },
      }),
    ),
  );
}

function renderPicker(
  props: Partial<ComponentProps<typeof OrderCustomerPicker>> = {},
) {
  const onSelect = jest.fn();
  const onClear = jest.fn();

  renderWithProviders(
    <OrderCustomerPicker
      selected={null}
      onSelect={onSelect}
      onClear={onClear}
      {...props}
    />,
  );

  return { onSelect, onClear };
}

describe("OrderCustomerPicker", () => {
  it("never asks a human for a UUID", () => {
    renderPicker();

    const input = screen.getByRole("searchbox");
    expect(input).toHaveValue("");
    // The placeholder and the hint promise what the API actually searches —
    // email, first name, last name (per token since TASK-406) — and nothing else.
    expect(screen.getByText(/ID вводити не потрібно/i)).toBeInTheDocument();
  });

  it("searches by name and hands back the whole account, not a typed id", async () => {
    const user = userEvent.setup();
    respondWith([makeUser()]);
    const { onSelect } = renderPicker();

    await user.type(screen.getByRole("searchbox"), "Олена");

    const pick = await screen.findByRole("button", {
      name: /Вибрати клієнта Олена Шевченко/i,
    });
    await user.click(pick);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const picked = onSelect.mock.calls[0][0] as PickedCustomer;
    expect(picked).toEqual({
      id: "550e8400-e29b-41d4-a716-446655440001",
      name: "Олена Шевченко",
      firstName: "Олена",
      lastName: "Шевченко",
      email: "olena@example.com",
      phone: "380501234567",
      isActive: true,
    });
  });

  it("does not fetch before there is something to search for", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/users", () => {
        calls += 1;
        return HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, limit: 8, totalPages: 0 },
        });
      }),
    );
    renderPicker();

    // Nothing typed: the query is `enabled: false`, so the whole customer list is
    // never pulled just because the tab was opened.
    await waitFor(() => expect(calls).toBe(0));
  });

  it("reports a failed lookup as a failure, not as «нікого не знайдено»", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/api/users", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderPicker();

    await user.type(screen.getByRole("searchbox"), "Олена");

    // TASK-402's lesson, applied here: blaming the operator's spelling for our
    // own outage sends them back to retype a name that was right all along.
    expect(
      await screen.findByText(/Не вдалося виконати пошук клієнтів/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Клієнтів не знайдено/i)).not.toBeInTheDocument();
  });

  it("says so when the search genuinely matches nobody", async () => {
    const user = userEvent.setup();
    respondWith([]);
    renderPicker();

    await user.type(screen.getByRole("searchbox"), "Хтось");

    expect(
      await screen.findByText(/Клієнтів не знайдено/i),
    ).toBeInTheDocument();
  });

  it("shows a deactivated account but refuses to pick it", async () => {
    const user = userEvent.setup();
    respondWith([makeUser({ isActive: false })]);
    const { onSelect } = renderPicker();

    await user.type(screen.getByRole("searchbox"), "Олена");

    // `adminCreateOrder` answers 403 for a deactivated account, and finding that
    // out after filling in the whole form is the worst possible moment. Hidden
    // entirely would be worse still: an operator looking for someone they know
    // exists must be told what happened to them.
    expect(await screen.findByText("(Деактивовано)")).toBeInTheDocument();
    expect(
      screen.getByText(/оформити на нього замовлення не можна/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Вибрати клієнта/i }),
    ).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows the chosen customer and lets the operator change their mind", async () => {
    const user = userEvent.setup();
    const { onClear } = renderPicker({
      selected: {
        id: "550e8400-e29b-41d4-a716-446655440001",
        name: "Олена Шевченко",
        firstName: "Олена",
        lastName: "Шевченко",
        email: "olena@example.com",
        phone: "380501234567",
        isActive: true,
      },
    });

    expect(screen.getByText("Олена Шевченко")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Змінити клієнта/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("surfaces the validation message from the form", () => {
    renderPicker({ error: "Виберіть клієнта зі списку." });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Виберіть клієнта зі списку.",
    );
    expect(screen.getByRole("searchbox")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
