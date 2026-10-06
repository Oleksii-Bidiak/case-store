/**
 * The pickup points of /settings/delivery (TASK-645, ДН-1.1–1.3, 1.6).
 *
 * Reorder is driven by the KEYBOARD only: jsdom has no layout, so dnd-kit's
 * collision detection cannot run; the pointer path shares one reducer with the
 * keyboard path (pinned in `shared/lib/sortable-tree`).
 */

import { http, HttpResponse } from "msw";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { resetReorderLock } from "@/shared/lib/reorder-lock";
import type { AdminPickupPointDto } from "@/entities/delivery";
import {
  PICKUP_ROW_PREFIX,
  PickupPointsPanel,
  pickupPointOrdersHref,
} from "./pickup-points-panel";

jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    undo: jest.fn(() => "undo-toast"),
    dismiss: jest.fn(),
  },
}));

const t = dict.pickupPoints;

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const BASE: Record<string, AdminPickupPointDto> = {
  [A]: {
    id: A,
    name: "Магазин на Хрещатику",
    city: "Київ",
    address: "вул. Хрещатик, 22",
    phone: "+380 44 123 45 67",
    workingHours: "Пн–Сб 10:00–20:00",
    mapUrl: null,
    isActive: true,
    sortOrder: 0,
    ordersCount: 38,
  },
  [B]: {
    id: B,
    name: "Магазин на Оболоні",
    city: "Київ",
    address: "просп. Оболонський, 1",
    phone: "+380 44 765 43 21",
    workingHours: "Щодня 10:00–21:00",
    mapUrl: null,
    isActive: true,
    sortOrder: 1,
    ordersCount: 12,
  },
  [C]: {
    id: C,
    name: "Склад на Лівому березі",
    city: "Київ",
    address: "вул. Причальна, 11",
    phone: null,
    workingHours: "Пн–Пт 9:00–18:00",
    mapUrl: null,
    isActive: false,
    sortOrder: 2,
    ordersCount: 4,
  },
};

function listResponse(order = [A, B, C]) {
  return {
    data: order.map((id, sortOrder) => ({ ...BASE[id], sortOrder })),
  };
}

let reorderBodies: unknown[] = [];
let updates: { id: string; body: unknown }[] = [];
let deletes: string[] = [];

beforeEach(() => {
  resetReorderLock();
  reorderBodies = [];
  updates = [];
  deletes = [];
  server.use(
    http.get("*/api/admin/pickup-points", () =>
      HttpResponse.json(listResponse()),
    ),
    http.patch("*/api/admin/pickup-points/reorder", async ({ request }) => {
      reorderBodies.push(await request.json());
      return HttpResponse.json(listResponse([B, A, C]));
    }),
    http.put("*/api/admin/pickup-points/:id", async ({ request, params }) => {
      const id = String(params.id);
      const body = (await request.json()) as Partial<AdminPickupPointDto>;
      updates.push({ id, body });
      return HttpResponse.json({ data: { ...BASE[id], ...body } });
    }),
    http.delete("*/api/admin/pickup-points/:id", ({ params }) => {
      deletes.push(String(params.id));
      return HttpResponse.json({ data: { id: params.id } });
    }),
  );
});

const rowEl = (id: string): HTMLTableRowElement => {
  const el = document.getElementById(`${PICKUP_ROW_PREFIX}${id}`);
  if (!el) throw new Error(`row ${id} is not rendered`);
  return el as HTMLTableRowElement;
};

const rowIds = (): string[] =>
  Array.from(
    document.querySelectorAll<HTMLTableRowElement>(
      `tr[id^='${PICKUP_ROW_PREFIX}']`,
    ),
  ).map((row) => row.id.replace(PICKUP_ROW_PREFIX, ""));

async function renderPanel() {
  const result = renderWithProviders(<PickupPointsPanel />, {
    auth: { isOwner: true },
  });
  await screen.findByRole("grid", { name: t.gridLabel });
  await waitFor(() => expect(rowIds()).toHaveLength(3));
  return result;
}

async function openRowMenu(id: string) {
  await userEvent.click(
    within(rowEl(id)).getByRole("button", {
      name: t.rowActionsAria(BASE[id].name),
    }),
  );
  return screen.findByRole("menu");
}

describe("PickupPointsPanel (TASK-645)", () => {
  it("lists every point with its hours, phone, orders and checkout state", async () => {
    await renderPanel();

    const a = within(rowEl(A));
    expect(a.getByText(BASE[A].name)).toBeInTheDocument();
    expect(
      a.getByText(t.location(BASE[A].city, BASE[A].address)),
    ).toBeInTheDocument();
    expect(a.getByText("38")).toBeInTheDocument();
    expect(a.getByText(t.statusActive)).toBeInTheDocument();

    const c = within(rowEl(C));
    expect(c.getByText(t.noPhone)).toBeInTheDocument();
    expect(c.getByText(t.statusInactive)).toBeInTheDocument();
  });

  it("offers edit, deactivate, the point's orders and delete — in that order", async () => {
    await renderPanel();

    const menu = await openRowMenu(A);
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      t.edit,
      t.deactivate,
      t.ordersLink(38),
      t.deleteItem,
    ]);
    expect(
      within(menu).getByRole("menuitem", { name: t.ordersLink(38) }),
    ).toHaveAttribute("href", pickupPointOrdersHref(A));
    expect(pickupPointOrdersHref(A)).toBe(`/orders?pickupPointId=${A}`);
  });

  it("deactivates an active point and activates an inactive one", async () => {
    await renderPanel();

    let menu = await openRowMenu(A);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: t.deactivate }),
    );
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({ id: A, body: { isActive: false } });

    menu = await openRowMenu(C);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: t.activate }),
    );
    await waitFor(() => expect(updates).toHaveLength(2));
    expect(updates[1]).toEqual({ id: C, body: { isActive: true } });
  });

  it("deletes only after the confirmation, which names the orders it unlinks", async () => {
    await renderPanel();

    const menu = await openRowMenu(A);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: t.deleteItem }),
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: t.deleteTitle(BASE[A].name),
    });
    expect(dialog).toHaveTextContent(t.deleteOrders(38));
    expect(dialog).toHaveTextContent(t.deleteAdvice);
    expect(t.deleteOrders(38)).toMatch(
      /^На неї посилаються 38 замовлень\. Вони збережуть /,
    );
    expect(deletes).toHaveLength(0);

    await userEvent.click(
      within(dialog).getByRole("button", { name: t.deleteAction }),
    );
    await waitFor(() => expect(deletes).toEqual([A]));
    expect(updates).toHaveLength(0);
  });

  it("«Деактивувати замість цього» deactivates and deletes nothing", async () => {
    await renderPanel();

    const menu = await openRowMenu(B);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: t.deleteItem }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: t.deleteInstead }),
    );

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({ id: B, body: { isActive: false } });
    expect(deletes).toHaveLength(0);
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });

  it("does not offer deactivating instead for a point that is already inactive", async () => {
    await renderPanel();

    const menu = await openRowMenu(C);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: t.deleteItem }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).queryByRole("button", { name: t.deleteInstead }),
    ).not.toBeInTheDocument();
    // …nor the advice to deactivate it.
    expect(dialog).not.toHaveTextContent(t.deleteAdvice);
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );
    expect(deletes).toHaveLength(0);
  });

  it("Space ↑ Space reorders and sends the COMPLETE new order", async () => {
    await renderPanel();

    act(() => rowEl(B).focus());
    fireEvent.keyDown(rowEl(B), { key: " " });
    fireEvent.keyDown(rowEl(B), { key: "ArrowUp" });
    expect(rowIds()).toEqual([B, A, C]);
    expect(reorderBodies).toHaveLength(0);
    fireEvent.keyDown(rowEl(B), { key: " " });

    await waitFor(() => expect(reorderBodies).toHaveLength(1));
    expect(reorderBodies[0]).toEqual({ orderedIds: [B, A, C] });
    await waitFor(() => expect(rowIds()).toEqual([B, A, C]));
  });

  it("opens the add dialog and the edit dialog for the row it was asked from", async () => {
    await renderPanel();

    await userEvent.click(screen.getByRole("button", { name: t.add }));
    expect(
      await screen.findByRole("dialog", {
        name: dict.pickupPointForm.createTitle,
      }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: dict.common.cancel }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    const menu = await openRowMenu(B);
    await userEvent.click(within(menu).getByRole("menuitem", { name: t.edit }));
    const dialog = await screen.findByRole("dialog", {
      name: dict.pickupPointForm.editTitle,
    });
    await waitFor(() =>
      expect(
        within(dialog).getByRole("textbox", {
          name: dict.pickupPointForm.name,
        }),
      ).toHaveValue(BASE[B].name),
    );
  });
});

describe("dict.pickupPoints.deleteOrders — agreement with the count", () => {
  it.each([
    [1, "На неї посилається 1 замовлення. Воно збереже "],
    [21, "На неї посилається 21 замовлення. Воно збереже "],
    [4, "На неї посилаються 4 замовлення. Вони збережуть "],
    [11, "На неї посилаються 11 замовлень. Вони збережуть "],
    [38, "На неї посилаються 38 замовлень. Вони збережуть "],
  ])("%i order(s)", (count, start) => {
    expect(t.deleteOrders(count).startsWith(start)).toBe(true);
  });

  it("says there are none for 0", () => {
    expect(t.deleteOrders(0)).toBe("Замовлень на неї немає.");
  });
});
