/**
 * `EditProductGroupView` — the group page by mockup (wave 198,
 * ProductGroupsProposal ГТ3–ГТ9, TASK-1084): the positions table with «⋯ →
 * Прибрати з групи», «Додати позицію…» over the catalogue, the save, and the
 * read-only page without `products:write` (TASK-1011).
 */

import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { EditProductGroupView } from "./edit-product-group-view";

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => "/product-groups/g1/edit",
  useSearchParams: () => new URLSearchParams(""),
}));

const g = dict.productGroups;
const f = dict.productGroupForm;

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_GROUP = "22222222-2222-4222-8222-222222222222";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const P4 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const sibling = (
  id: string,
  name: string,
  attributes: Record<string, string>,
) => ({
  id,
  slug: `slug-${id.slice(0, 4)}`,
  name,
  price: "52999.00",
  attributes,
  stock: 4,
  isActive: true,
  positionOrder: 0,
});

const GROUP = {
  id: GROUP_ID,
  name: "Смартфон Apple iPhone 16 Pro",
  isActive: true,
  axes: [
    { name: "Пам'ять", sortOrder: 0 },
    { name: "Колір", sortOrder: 1 },
  ],
  positions: [
    sibling(P1, "iPhone 16 Pro 128 чорний", {
      "Пам'ять": "128 ГБ",
      Колір: "Чорний титан",
    }),
    sibling(P2, "iPhone 16 Pro 128 білий", {
      "Пам'ять": "128 ГБ",
      Колір: "Білий титан",
    }),
  ],
};

const product = (id: string, name: string, groupId: string | null) => ({
  id,
  name,
  slug: `slug-${id.slice(0, 4)}`,
  price: "99999.00",
  stock: 1,
  reservedQty: 0,
  physicalQty: 1,
  categoryId: "cat",
  groupId,
  attributes: { "Пам'ять": "1 ТБ" },
  positionOrder: 0,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ratingAverage: null,
  ratingCount: 0,
  specs: [],
  highlights: [],
});

let groupBodies: unknown[] = [];
let updateBodies: unknown[] = [];

beforeEach(() => {
  mockReplace.mockClear();
  mockPush.mockClear();
  groupBodies = [];
  updateBodies = [];
  server.use(
    http.get("*/api/product-groups/:id", () =>
      HttpResponse.json({ data: GROUP }),
    ),
    http.get("*/api/product-groups", () =>
      HttpResponse.json({
        data: [
          {
            id: OTHER_GROUP,
            name: "Смартфон Apple iPhone 16 Pro Max",
            isActive: true,
            axes: [],
            positionCount: 1,
          },
        ],
      }),
    ),
    http.patch("*/api/product-groups/:id", async ({ request }) => {
      updateBodies.push(await request.json());
      return HttpResponse.json({ data: GROUP });
    }),
    http.patch("*/api/products/group", async ({ request }) => {
      groupBodies.push(await request.json());
      return HttpResponse.json({ data: { updatedCount: 1 } });
    }),
    http.get("*/api/products/admin/list", () =>
      HttpResponse.json({
        data: [
          product(P3, "iPhone 16 Pro 1 ТБ, чорний", null),
          product(P4, "iPhone 16 Pro Max 1 ТБ", OTHER_GROUP),
        ],
        meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
      }),
    ),
  );
});

const OWNER = { auth: { isOwner: true } };

describe("EditProductGroupView (wave 198)", () => {
  it("titles the page with the group and lists its positions by axis value", async () => {
    renderWithProviders(<EditProductGroupView groupId={GROUP_ID} />, OWNER);

    expect(
      await screen.findByRole("heading", { name: GROUP.name }),
    ).toBeInTheDocument();
    expect(screen.getByText(g.statusActive)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: g.back })).toHaveAttribute(
      "href",
      "/product-groups",
    );

    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: "Колір" }),
    ).toBeInTheDocument();
    expect(within(table).getByText("Білий титан")).toBeInTheDocument();
    expect(
      within(table).getByRole("link", {
        name: g.openProductAria("iPhone 16 Pro 128 білий"),
      }),
    ).toHaveAttribute("href", `/products/${P2}`);
  });

  it("«⋯ → Прибрати з групи…» asks first, then takes the position out", async () => {
    renderWithProviders(<EditProductGroupView groupId={GROUP_ID} />, OWNER);
    await screen.findByRole("heading", { name: GROUP.name });

    const table = screen.getByRole("table");
    const openMenu = async () => {
      await userEvent.click(
        within(table).getByRole("button", {
          name: dict.common.registry.rowActionsAria("iPhone 16 Pro 128 білий"),
        }),
      );
      await userEvent.click(
        screen.getByRole("menuitem", { name: g.removeFromGroup }),
      );
      return screen.findByRole("alertdialog");
    };

    // A misclick is cancelled without a write.
    let dialog = await openMenu();
    expect(dialog).toHaveTextContent(
      g.removeConfirmTitle("iPhone 16 Pro 128 білий"),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );
    expect(groupBodies).toEqual([]);

    dialog = await openMenu();
    await userEvent.click(
      within(dialog).getByRole("button", { name: g.removeConfirmAction }),
    );
    await waitFor(() =>
      expect(groupBodies).toEqual([{ ids: [P2], groupId: null }]),
    );
  });

  it("«Додати позицію…» searches the catalogue and adds the ticked products", async () => {
    renderWithProviders(<EditProductGroupView groupId={GROUP_ID} />, OWNER);
    await screen.findByRole("heading", { name: GROUP.name });

    await userEvent.click(screen.getByRole("button", { name: g.addPositions }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByRole("searchbox", { name: g.pickerSearchAria }),
      "iphone 16 pro 1",
    );

    const free = await within(dialog).findByRole("checkbox", {
      name: /iPhone 16 Pro 1 ТБ, чорний/,
    });
    // A product of another group cannot be ticked — and says where it is.
    const taken = within(dialog).getByRole("checkbox", {
      name: /iPhone 16 Pro Max 1 ТБ/,
    });
    expect(taken).toBeDisabled();
    expect(
      await within(dialog).findByText(
        g.pickerInOther("Смартфон Apple iPhone 16 Pro Max"),
      ),
    ).toBeInTheDocument();

    await userEvent.click(free);
    expect(within(dialog).getByText(g.pickerSelected(1))).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: g.pickerSubmit(1) }),
    );

    await waitFor(() =>
      expect(groupBodies).toEqual([{ ids: [P3], groupId: GROUP_ID }]),
    );
  });

  it("saves the name, the ordered axes and the flag", async () => {
    renderWithProviders(<EditProductGroupView groupId={GROUP_ID} />, OWNER);
    await screen.findByRole("heading", { name: GROUP.name });

    await userEvent.click(screen.getByRole("button", { name: f.submit }));

    await waitFor(() =>
      expect(updateBodies).toEqual([
        {
          name: GROUP.name,
          axes: [
            { name: "Пам'ять", sortOrder: 0 },
            { name: "Колір", sortOrder: 1 },
          ],
          isActive: true,
        },
      ]),
    );
  });

  it("without products:write: read-only, no adding or removing positions", async () => {
    renderWithProviders(<EditProductGroupView groupId={GROUP_ID} />, {
      auth: { permissions: ["products:read"] },
    });
    await screen.findByRole("heading", { name: GROUP.name });

    expect(screen.getByRole("textbox", { name: f.name })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: g.addPositions }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: f.submit }),
    ).not.toBeInTheDocument();

    const table = screen.getByRole("table");
    await userEvent.click(
      within(table).getByRole("button", {
        name: dict.common.registry.rowActionsAria("iPhone 16 Pro 128 білий"),
      }),
    );
    expect(
      screen.getByRole("menuitem", { name: g.openProduct }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: g.removeFromGroup }),
    ).not.toBeInTheDocument();
  });

  it("an unknown group returns to the list", async () => {
    server.use(
      http.get("*/api/product-groups/:id", () =>
        HttpResponse.json({ message: "nope" }, { status: 404 }),
      ),
    );

    renderWithProviders(<EditProductGroupView groupId={GROUP_ID} />, OWNER);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/product-groups"),
    );
  });
});
