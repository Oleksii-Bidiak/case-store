import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminProductTable } from "./admin-product-table";

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/products",
  useSearchParams: () => new URLSearchParams(""),
}));

function makeProductRow() {
  return {
    id: "product-1",
    name: "iPhone 15 Pro Case",
    slug: "iphone-15-pro-case",
    price: "499.00",
    categoryId: "cat-1",
    isActive: true,
    // TASK-254: admin list items are ProductEntity with the derived stock split.
    stock: 10,
    reservedQty: 3,
    physicalQty: 13,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

function stubEndpoints() {
  server.use(
    // TASK-230: the table lists via the guarded admin endpoint (all statuses).
    http.get("*/api/products/admin/list", () =>
      HttpResponse.json({
        data: [makeProductRow()],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      }),
    ),
    http.get("*/api/categories", () =>
      HttpResponse.json({
        data: [{ id: "cat-1", name: "Cases" }],
        meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
      }),
    ),
  );
}

describe("AdminProductTable — column sorting (TASK-147)", () => {
  beforeEach(() => mockReplace.mockClear());

  it("renders sortable Name/Price/Created headers", async () => {
    stubEndpoints();
    renderWithProviders(<AdminProductTable />);
    await screen.findByText("iPhone 15 Pro Case");

    for (const label of [
      dict.products.colName,
      dict.products.colPrice,
      dict.products.colCreated,
    ]) {
      expect(
        screen.getByRole("button", { name: dict.common.sortByAria(label) }),
      ).toBeInTheDocument();
    }
  });

  it("updates the URL with the sort field on header click", async () => {
    stubEndpoints();
    renderWithProviders(<AdminProductTable />);
    await screen.findByText("iPhone 15 Pro Case");

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.common.sortByAria(dict.products.colPrice),
      }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("sortBy=price"),
    );
  });
});

describe("AdminProductTable — stock column (TASK-254)", () => {
  beforeEach(() => mockReplace.mockClear());

  it("renders the available / reserved / physical composite cell", async () => {
    stubEndpoints();
    renderWithProviders(<AdminProductTable />);
    const nameCell = await screen.findByText("iPhone 15 Pro Case");

    const row = nameCell.closest("tr") as HTMLElement;
    // available 10 / reserved 3 / physical 13 — all rendered in one cell.
    expect(row.textContent).toContain("10");
    expect(row.textContent).toContain("3");
    expect(row.textContent).toContain("13");
  });

  it("sorts by stock (Вільно) when the column header is clicked", async () => {
    stubEndpoints();
    renderWithProviders(<AdminProductTable />);
    await screen.findByText("iPhone 15 Pro Case");

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.common.sortByAria(dict.products.colStock),
      }),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("sortBy=stock"),
    );
  });
});

describe("AdminProductTable — mobile card layout (TASK-258)", () => {
  it("renders in card mode with per-cell labels", async () => {
    stubEndpoints();
    const { container } = renderWithProviders(<AdminProductTable />);
    await screen.findByText("iPhone 15 Pro Case");

    expect(container.querySelector('[data-slot="table"]')).toHaveClass(
      "max-md:block",
    );
    expect(
      container.querySelector(`[data-label="${dict.products.colName}"]`),
    ).toBeInTheDocument();
    expect(
      container.querySelector(`[data-label="${dict.common.actions}"]`),
    ).toBeInTheDocument();
  });

  it("announces the selection into the live region (TASK-292)", async () => {
    const user = userEvent.setup();
    stubEndpoints();

    renderWithProviders(<AdminProductTable />);
    await screen.findByText("iPhone 15 Pro Case");

    // Regression guard. `useRowSelection` and `useProductBulkStatus` both call
    // `useAnnouncer()`, so they have to run BELOW the `<LiveAnnouncer>`. A hook
    // called in the very component that renders the provider silently gets the
    // default no-op context, and every announcement disappears with nothing on
    // screen looking wrong.
    await user.click(
      screen.getByRole("checkbox", {
        name: dict.products.bulk.selectRow("iPhone 15 Pro Case"),
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
        dict.common.table.announceSelected("iPhone 15 Pro Case", 1),
      ),
    );
  });
});

describe("AdminProductTable — photo column and filters (TASK-362)", () => {
  beforeEach(() => mockReplace.mockClear());

  // After a catalogue import — which deliberately brings no photos — this
  // column IS the operator's worklist.
  it("flags a product with no photo instead of showing an empty cell", async () => {
    stubEndpoints();
    renderWithProviders(<AdminProductTable />);
    await screen.findByText("iPhone 15 Pro Case");

    expect(screen.getByText(dict.products.noPhoto)).toBeInTheDocument();
  });

  it("renders the primary image as a thumbnail when the product has one", async () => {
    server.use(
      http.get("*/api/products/admin/list", () =>
        HttpResponse.json({
          data: [
            {
              ...makeProductRow(),
              primaryImage: {
                id: "img-1",
                url: "https://cdn.example.com/a.jpg",
                alt: null,
                blurDataUrl: null,
                sortOrder: 0,
                isPrimary: true,
              },
            },
          ],
          meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
        }),
      ),
      http.get("*/api/categories", () =>
        HttpResponse.json({
          data: [{ id: "cat-1", name: "Cases" }],
          meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
        }),
      ),
    );
    renderWithProviders(<AdminProductTable />);
    await screen.findByText("iPhone 15 Pro Case");

    expect(screen.queryByText(dict.products.noPhoto)).toBeNull();
  });

  it("shows the article number and brand under the name", async () => {
    server.use(
      http.get("*/api/products/admin/list", () =>
        HttpResponse.json({
          data: [
            {
              ...makeProductRow(),
              sku: "IP15-CLR",
              brand: { id: "b1", name: "Spigen", slug: "spigen" },
            },
          ],
          meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
        }),
      ),
      http.get("*/api/categories", () =>
        HttpResponse.json({
          data: [{ id: "cat-1", name: "Cases" }],
          meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
        }),
      ),
    );
    renderWithProviders(<AdminProductTable />);
    await screen.findByText("iPhone 15 Pro Case");

    // After an import, 274 products share a name — the article number is what
    // tells two rows apart.
    expect(screen.getByText("IP15-CLR · Spigen")).toBeInTheDocument();
  });

  // TASK-423: these were two bare native `<select>`s; they are now the shared
  // `TableFilters`, so the interaction is open-the-listbox + click-the-option
  // instead of `selectOptions`. What is asserted is unchanged — the URL, because
  // that is what makes a restock worklist a link the operator can keep.
  it("puts the status filter in the URL so a worklist is a shareable link", async () => {
    stubEndpoints();
    renderWithProviders(<AdminProductTable />);
    await screen.findByText("iPhone 15 Pro Case");

    await userEvent.click(
      screen.getByRole("combobox", { name: dict.products.filterStatus }),
    );
    await userEvent.click(
      screen.getByRole("option", { name: dict.products.filterStatusHidden }),
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockReplace.mock.calls.at(-1)?.[0]).toContain("status=hidden");
  });

  it("puts the stock filter in the URL too", async () => {
    stubEndpoints();
    renderWithProviders(<AdminProductTable />);
    await screen.findByText("iPhone 15 Pro Case");

    await userEvent.click(
      screen.getByRole("combobox", { name: dict.products.filterStock }),
    );
    await userEvent.click(
      screen.getByRole("option", { name: dict.products.filterStockOut }),
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockReplace.mock.calls.at(-1)?.[0]).toContain("stock=out");
  });
});

/**
 * Bulk «Перемістити до групи» (TASK-423 / AD-PROD-33).
 *
 * The assertions are on the REQUEST BODY: the ids the operator selected and the
 * group they picked. A dialog that looks right while sending the wrong group, or
 * sending `groupId: undefined` where `null` means "ungroup", renders identically
 * and silently reassigns the wrong products.
 */
describe("AdminProductTable — bulk move to group (TASK-423)", () => {
  beforeEach(() => mockReplace.mockClear());

  /** Stub the group list and the bulk endpoint; hand back the recorded bodies. */
  function stubGroupBulk() {
    const bodies: unknown[] = [];
    server.use(
      http.get("*/api/product-groups", () =>
        HttpResponse.json({
          data: [
            { id: "group-a", name: "Чохли Clear", isActive: true, axes: [] },
            { id: "group-b", name: "Чохли Silicone", isActive: true, axes: [] },
          ],
        }),
      ),
      http.patch("*/api/products/group", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: { updatedCount: 1 } });
      }),
    );
    return bodies;
  }

  /** Select the single row the list stub returns. */
  async function selectTheRow() {
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: dict.products.bulk.selectRow("iPhone 15 Pro Case"),
      }),
    );
  }

  it("offers the action only while rows are selected", async () => {
    stubEndpoints();
    renderWithProviders(<AdminProductTable />);
    await screen.findByText("iPhone 15 Pro Case");

    // The bulk bar renders nothing at zero — an always-present bar of disabled
    // buttons reads as broken.
    expect(
      screen.queryByRole("button", {
        name: dict.products.bulk.moveToGroup(1),
      }),
    ).not.toBeInTheDocument();

    await selectTheRow();

    expect(
      screen.getByRole("button", { name: dict.products.bulk.moveToGroup(1) }),
    ).toBeInTheDocument();
  });

  it("sends the selected ids and the chosen group", async () => {
    stubEndpoints();
    const bodies = stubGroupBulk();
    renderWithProviders(<AdminProductTable />);
    await screen.findByText("iPhone 15 Pro Case");
    await selectTheRow();

    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.moveToGroup(1) }),
    );
    await userEvent.click(
      await screen.findByLabelText(dict.products.bulk.groupDialogLabel),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Чохли Silicone" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.groupSubmit }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ ids: ["product-1"], groupId: "group-b" });
  });

  it("sends groupId: null — not undefined — for «Без групи»", async () => {
    // `null` is the MEANING "take these out of their group"; the DTO requires the
    // field, precisely so that an omission cannot be read as a destructive clear.
    stubEndpoints();
    const bodies = stubGroupBulk();
    renderWithProviders(<AdminProductTable />);
    await screen.findByText("iPhone 15 Pro Case");
    await selectTheRow();

    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.moveToGroup(1) }),
    );
    await userEvent.click(
      await screen.findByLabelText(dict.products.bulk.groupDialogLabel),
    );
    await userEvent.click(
      await screen.findByRole("option", {
        name: dict.products.bulk.groupNone,
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.groupSubmit }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ ids: ["product-1"], groupId: null });
  });

  it("refuses to submit until a target is picked", async () => {
    stubEndpoints();
    const bodies = stubGroupBulk();
    renderWithProviders(<AdminProductTable />);
    await screen.findByText("iPhone 15 Pro Case");
    await selectTheRow();

    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.moveToGroup(1) }),
    );
    const submit = await screen.findByRole("button", {
      name: dict.products.bulk.groupSubmit,
    });

    // Defaulting to the first group would be a silent guess about which family
    // these products belong to.
    expect(submit).toBeDisabled();
    await userEvent.click(submit);
    expect(bodies).toHaveLength(0);
  });

  it("does not fetch the group list until the dialog is opened", async () => {
    stubEndpoints();
    let groupRequests = 0;
    server.use(
      http.get("*/api/product-groups", () => {
        groupRequests += 1;
        return HttpResponse.json({ data: [] });
      }),
    );

    renderWithProviders(<AdminProductTable />);
    await screen.findByText("iPhone 15 Pro Case");
    await selectTheRow();

    // A request per page view, for a control most visits never touch.
    expect(groupRequests).toBe(0);

    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.moveToGroup(1) }),
    );
    await waitFor(() => expect(groupRequests).toBe(1));
  });

  it("clears the selection once the server confirms", async () => {
    stubEndpoints();
    stubGroupBulk();
    renderWithProviders(<AdminProductTable />);
    await screen.findByText("iPhone 15 Pro Case");
    await selectTheRow();

    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.moveToGroup(1) }),
    );
    await userEvent.click(
      await screen.findByLabelText(dict.products.bulk.groupDialogLabel),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Чохли Clear" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.groupSubmit }),
    );

    // Bar gone ⇒ selection cleared ⇒ the dialog closed on a real confirmation,
    // not optimistically.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: dict.products.bulk.moveToGroup(1),
        }),
      ).not.toBeInTheDocument(),
    );
  });
});
