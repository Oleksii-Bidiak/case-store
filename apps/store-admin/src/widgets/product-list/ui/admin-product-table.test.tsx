import { http, HttpResponse } from "msw";
import {
  act,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { dict } from "@/shared/config";
import { UNDO_WINDOW_MS } from "@/shared/lib/list-reorder/use-reorder-lifecycle";
import { AdminProductTable } from "./admin-product-table";

const mockReplace = jest.fn();
// TASK-427: the «Видалені» view is a URL state, so the query string has to be
// steerable per test — same ref pattern as AdminUserTable.
const mockSearchParamsRef = { current: new URLSearchParams("") };
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/products",
  useSearchParams: () => mockSearchParamsRef.current,
}));

afterEach(() => {
  mockSearchParamsRef.current = new URLSearchParams("");
});

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

/** A node of the nested category tree, valid for both the admin and public read. */
interface TreeNodeStub {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  depth: number;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
  subtreeProductCount: number;
  children: TreeNodeStub[];
}

function treeNode(
  id: string,
  name: string,
  children: TreeNodeStub[] = [],
  parentId: string | null = null,
  depth = 1,
): TreeNodeStub {
  return {
    id,
    name,
    slug: id,
    parentId,
    depth,
    isActive: true,
    sortOrder: 0,
    productCount: 0,
    subtreeProductCount: 0,
    children,
  };
}

/**
 * TASK-717: category names come from the full tree — the admin tree for a
 * session with `categories:write`, the public tree otherwise. Both are stubbed
 * so a restricted render (the delete-permission cases) stays off
 * onUnhandledRequest.
 */
function categoryTreeHandlers(
  tree: TreeNodeStub[] = [treeNode("cat-1", "Cases")],
) {
  return [
    http.get("*/api/categories/admin/tree", () =>
      HttpResponse.json({ data: tree }),
    ),
    http.get("*/api/categories/tree", () => HttpResponse.json({ data: tree })),
  ];
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
    ...categoryTreeHandlers(),
  );
}

/**
 * TASK-427: the row's delete action calls `useAuth()`, which throws outside a
 * provider — every render in this file therefore goes through the session
 * fixture. Owner by default (the owner holds every permission implicitly), so
 * the pre-existing sorting / filter / bulk assertions are unaffected.
 */
function renderTable(options: { permissions?: string[] } = {}) {
  return renderWithProviders(
    <WithAuth
      isOwner={options.permissions === undefined}
      permissions={options.permissions ?? []}
    >
      <AdminProductTable />
    </WithAuth>,
  );
}

describe("AdminProductTable — column sorting (TASK-147)", () => {
  beforeEach(() => mockReplace.mockClear());

  it("renders sortable Name/Price/Created headers", async () => {
    stubEndpoints();
    renderTable();
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
    renderTable();
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
    renderTable();
    const nameCell = await screen.findByText("iPhone 15 Pro Case");

    const row = nameCell.closest("tr") as HTMLElement;
    // available 10 / reserved 3 / physical 13 — all rendered in one cell.
    expect(row.textContent).toContain("10");
    expect(row.textContent).toContain("3");
    expect(row.textContent).toContain("13");
  });

  it("sorts by stock (Вільно) when the column header is clicked", async () => {
    stubEndpoints();
    renderTable();
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
    const { container } = renderTable();
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

    renderTable();
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
    renderTable();
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
      ...categoryTreeHandlers(),
    );
    renderTable();
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
      ...categoryTreeHandlers(),
    );
    renderTable();
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
    renderTable();
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
    renderTable();
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
    renderTable();
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
    renderTable();
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
    renderTable();
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
    renderTable();
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

    renderTable();
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
    renderTable();
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

/**
 * Bulk «Задати колір» (TASK-487 / owner decision B-10).
 *
 * The assertions are on the REQUEST BODY, for the reason the group block above
 * gives: a dialog that looks right while sending the wrong value renders
 * identically. The one extra thing pinned here is that `null` (clear) and a
 * blank string are NOT the same thing — the API treats `null` as "remove the
 * colour", and a dialog that fell through to it from an empty box would make
 * pressing «Записати» on a half-typed field quietly destructive.
 */
describe("AdminProductTable — bulk set colour (TASK-487)", () => {
  // TASK-812: the clear prompt is an AlertDialog. The spy only proves that
  // `window.confirm` is never reached any more.
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    mockReplace.mockClear();
    confirmSpy = jest.spyOn(window, "confirm");
  });
  afterEach(() => confirmSpy.mockRestore());

  /** Stub the bulk colour endpoint; hand back the recorded bodies. */
  function stubColorBulk() {
    const bodies: unknown[] = [];
    server.use(
      http.patch("*/api/products/color", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: { updatedCount: 1 } });
      }),
    );
    return bodies;
  }

  async function selectTheRow() {
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: dict.products.bulk.selectRow("iPhone 15 Pro Case"),
      }),
    );
  }

  async function openDialog() {
    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.setColor(1) }),
    );
    return screen.findByLabelText(dict.products.bulk.colorDialogLabel);
  }

  it("offers the action only while rows are selected", async () => {
    stubEndpoints();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(
      screen.queryByRole("button", { name: dict.products.bulk.setColor(1) }),
    ).not.toBeInTheDocument();

    await selectTheRow();

    expect(
      screen.getByRole("button", { name: dict.products.bulk.setColor(1) }),
    ).toBeInTheDocument();
  });

  it("sends the selected ids and the typed colour, trimmed", async () => {
    stubEndpoints();
    const bodies = stubColorBulk();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");
    await selectTheRow();

    const input = await openDialog();
    await userEvent.type(input, "  Чорний  ");
    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.colorSubmit }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ ids: ["product-1"], color: "Чорний" });
  });

  it("sends color: null — not an empty string — for «Прибрати колір»", async () => {
    stubEndpoints();
    const bodies = stubColorBulk();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");
    await selectTheRow();

    await openDialog();
    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.colorClear }),
    );

    // Removing a colour takes the products out of the colour filter — the one
    // direction of this action that is worth asking about.
    const prompt = await screen.findByRole("alertdialog");
    expect(prompt).toHaveTextContent(dict.products.bulk.colorClearConfirm(1));
    expect(bodies).toHaveLength(0);
    await userEvent.click(
      within(prompt).getByRole("button", {
        name: dict.products.bulk.colorClear,
      }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ ids: ["product-1"], color: null });
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("writes nothing when the clear prompt is declined", async () => {
    stubEndpoints();
    const bodies = stubColorBulk();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");
    await selectTheRow();

    await openDialog();
    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.colorClear }),
    );
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: dict.common.cancel,
      }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(bodies).toHaveLength(0);
    // The colour dialog is still open — declining the prompt is not «close».
    expect(
      screen.getByLabelText(dict.products.bulk.colorDialogLabel),
    ).toBeInTheDocument();
  });

  it("refuses to submit an empty colour rather than treating it as a clear", async () => {
    stubEndpoints();
    const bodies = stubColorBulk();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");
    await selectTheRow();

    await openDialog();
    const submit = screen.getByRole("button", {
      name: dict.products.bulk.colorSubmit,
    });

    expect(submit).toBeDisabled();
    await userEvent.click(submit);
    expect(bodies).toHaveLength(0);
  });

  it("does NOT ask for confirmation when setting a colour", async () => {
    // Nothing leaves the storefront and a typo is fixed by running it again —
    // a prompt would be noise on the action an operator repeats most.
    stubEndpoints();
    stubColorBulk();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");
    await selectTheRow();

    const input = await openDialog();
    await userEvent.type(input, "Білий");
    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.colorSubmit }),
    );

    await waitFor(() =>
      expect(
        screen.queryByLabelText(dict.products.bulk.colorDialogLabel),
      ).toBeNull(),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("clears the selection once the server confirms", async () => {
    stubEndpoints();
    stubColorBulk();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");
    await selectTheRow();

    const input = await openDialog();
    await userEvent.type(input, "Чорний");
    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.colorSubmit }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: dict.products.bulk.setColor(1) }),
      ).not.toBeInTheDocument(),
    );
  });

  it("forgets the previous colour when the dialog is reopened", async () => {
    // A dialog that remembers last time's value is a dialog that writes the
    // wrong colour to the next selection.
    stubEndpoints();
    stubColorBulk();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");
    await selectTheRow();

    const input = await openDialog();
    await userEvent.type(input, "Чорний");
    await userEvent.click(
      screen.getByRole("button", { name: dict.common.cancel }),
    );

    await selectTheRow();
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: dict.products.bulk.selectRow("iPhone 15 Pro Case"),
      }),
    );
    expect(await openDialog()).toHaveValue("");
  });
});

/**
 * TASK-427 — deleting from the row.
 *
 * `DELETE /api/products/:id` had existed since TASK-140, with a permission and a
 * proper soft delete, and no button anywhere in the panel could reach it.
 */
describe("AdminProductTable — delete a product (TASK-427)", () => {
  /** The list + categories + a counting DELETE handler for `product-1`. */
  function stubDeletableRow() {
    const counts = { list: 0, deletes: 0 };
    server.use(
      http.get("*/api/products/admin/list", () => {
        counts.list += 1;
        return HttpResponse.json({
          data: [makeProductRow()],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        });
      }),
      ...categoryTreeHandlers(),
      http.delete("*/api/products/product-1", () => {
        counts.deletes += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    return counts;
  }

  const clickDelete = () =>
    userEvent.click(
      screen.getByRole("button", { name: dict.products.deleteAction }),
    );

  it("says what a soft delete actually does before asking to confirm", async () => {
    stubDeletableRow();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await clickDelete();

    // The three facts an operator decides on: the order history survives, the
    // slug and артикул are freed (so this is NOT «приховати»), and deactivation
    // is the reversible action they may actually have wanted.
    expect(
      await screen.findByText(dict.products.deleteHeading),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.products.deleteKeeps)).toBeInTheDocument();
    expect(screen.getByText(dict.products.deleteFrees)).toBeInTheDocument();
    expect(
      screen.getByText(dict.products.deleteAlternative),
    ).toBeInTheDocument();
  });

  it("sends nothing while the confirm is open, and DELETEs once confirmed", async () => {
    const counts = stubDeletableRow();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    await clickDelete();
    expect(counts.deletes).toBe(0);

    await userEvent.click(
      screen.getByRole("button", { name: dict.products.deleteConfirm }),
    );

    await waitFor(() => expect(counts.deletes).toBe(1));
    // The row has to leave the table: the list query is invalidated, not just
    // the product's own cache entry.
    await waitFor(() => expect(counts.list).toBeGreaterThan(1));
  });

  it("offers no delete control to a session without products:delete", async () => {
    stubDeletableRow();
    renderTable({ permissions: ["products:read"] });
    await screen.findByText("iPhone 15 Pro Case");

    expect(
      screen.queryByRole("button", { name: dict.products.deleteAction }),
    ).toBeNull();
  });

  it("links the product name to its read-only card", async () => {
    stubEndpoints();
    renderTable();

    expect(
      await screen.findByRole("link", { name: "iPhone 15 Pro Case" }),
    ).toHaveAttribute("href", "/products/product-1");
  });
});

/**
 * TASK-427 — finding what was deleted.
 *
 * Before this filter the repository hard-coded `deletedAt: null` on every admin
 * read, so a deleted product was gone from the panel entirely: the operator had
 * no way to confirm the delete had happened, and no way to see what was removed
 * last week.
 */
describe("AdminProductTable — the deleted view (TASK-427)", () => {
  /** Records the query string of every listing request. */
  function stubListRecordingQueries() {
    const queries: string[] = [];
    server.use(
      http.get("*/api/products/admin/list", ({ request }) => {
        queries.push(new URL(request.url).search);
        return HttpResponse.json({
          data: [makeProductRow()],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        });
      }),
      ...categoryTreeHandlers(),
    );
    return queries;
  }

  it("asks for live products by default — the flag is absent, not false", async () => {
    const queries = stubListRecordingQueries();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(queries[0]).not.toContain("deleted");
  });

  it("switches the listing to tombstones on ?deleted=only", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    const queries = stubListRecordingQueries();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    expect(queries[0]).toContain("deleted=true");
    expect(screen.getByText(dict.products.deletedNotice)).toBeInTheDocument();
    expect(screen.getByText(dict.products.deletedBadge)).toBeInTheDocument();
  });

  it("offers no write on a tombstoned row — it accepts none", async () => {
    mockSearchParamsRef.current = new URLSearchParams("deleted=only");
    stubListRecordingQueries();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");

    // No card link (every by-id read excludes the row → a 404), no edit link,
    // no delete, no status toggle and nothing to select for a bulk action.
    expect(
      screen.queryByRole("link", { name: "iPhone 15 Pro Case" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: dict.common.edit })).toBeNull();
    expect(
      screen.queryByRole("button", { name: dict.products.deleteAction }),
    ).toBeNull();
    expect(
      screen.getByRole("checkbox", {
        name: dict.products.bulk.selectRow("iPhone 15 Pro Case"),
      }),
    ).toBeDisabled();
  });
});

describe("AdminProductTable — category column covers every depth (TASK-717)", () => {
  const LEAF_ID = "cat-leaf";
  // Аксесуари → Чохли → Чохли для iPhone: the product sits on level 3, which is
  // where an import files nearly every position. The old lookup read active
  // ROOTS only and answered «—» here.
  const chain = [
    treeNode("cat-root", "Аксесуари", [
      treeNode(
        "cat-mid",
        "Чохли",
        [treeNode(LEAF_ID, "Чохли для iPhone", [], "cat-mid", 3)],
        "cat-root",
        2,
      ),
    ]),
  ];

  /** Stub the list with one product on the leaf, recording which tree was read. */
  function stubLeafProduct() {
    const reads = { admin: 0, public: 0 };
    server.use(
      http.get("*/api/products/admin/list", () =>
        HttpResponse.json({
          data: [{ ...makeProductRow(), categoryId: LEAF_ID }],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
      http.get("*/api/categories/admin/tree", () => {
        reads.admin += 1;
        return HttpResponse.json({ data: chain });
      }),
      http.get("*/api/categories/tree", () => {
        reads.public += 1;
        return HttpResponse.json({ data: chain });
      }),
    );
    return reads;
  }

  it("names a level-3 subcategory from the admin tree for a categories:write holder", async () => {
    const reads = stubLeafProduct();
    renderTable({ permissions: ["products:read", "categories:write"] });

    expect(await screen.findByText("Чохли для iPhone")).toBeInTheDocument();
    expect(reads.admin).toBeGreaterThan(0);
    // The full tree already covers it — the public read is never made.
    expect(reads.public).toBe(0);
  });

  it("names it for the owner too (every permission implicitly)", async () => {
    stubLeafProduct();
    renderTable();

    expect(await screen.findByText("Чохли для iPhone")).toBeInTheDocument();
  });

  it("falls back to the public tree for a manager without categories:write — never asks the 403 route", async () => {
    const reads = stubLeafProduct();
    renderTable({ permissions: ["products:read"] });

    expect(await screen.findByText("Чохли для iPhone")).toBeInTheDocument();
    expect(reads.public).toBeGreaterThan(0);
    expect(reads.admin).toBe(0);
  });

  it("still shows «—» for a category the tree does not contain", async () => {
    stubLeafProduct();
    server.use(
      http.get("*/api/categories/tree", () =>
        HttpResponse.json({ data: [treeNode("other", "Інше")] }),
      ),
    );
    renderTable({ permissions: ["products:read"] });

    await screen.findByText("iPhone 15 Pro Case");
    // The name/article line also falls back to «—», so read the category cell.
    const cell = document.querySelector(
      `td[data-label="${dict.products.colCategory}"]`,
    );
    await waitFor(() => expect(cell).toHaveTextContent("—"));
    expect(screen.queryByText("Чохли для iPhone")).toBeNull();
  });
});

/**
 * Bulk activate / deactivate (TASK-355) through the shared `useBulkStatus`
 * engine, with the prompt as an AlertDialog (TASK-812).
 */
describe("AdminProductTable — bulk status confirm (TASK-812)", () => {
  function stubStatusBulk() {
    const bodies: unknown[] = [];
    server.use(
      http.patch("*/api/products/status", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: { updatedCount: 1 } });
      }),
    );
    return bodies;
  }

  async function selectTheRow() {
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: dict.products.bulk.selectRow("iPhone 15 Pro Case"),
      }),
    );
  }

  it("asks in an AlertDialog before deactivating; cancel sends nothing", async () => {
    const confirmSpy = jest.spyOn(window, "confirm");
    stubEndpoints();
    const bodies = stubStatusBulk();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");
    await selectTheRow();

    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.deactivate(1) }),
    );
    const prompt = await screen.findByRole("alertdialog");
    expect(prompt).toHaveTextContent(dict.products.bulk.deactivateConfirm(1));

    await userEvent.click(
      within(prompt).getByRole("button", { name: dict.common.cancel }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(bodies).toHaveLength(0);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("deactivates once confirmed, and activating does not ask at all", async () => {
    stubEndpoints();
    const bodies = stubStatusBulk();
    renderTable();
    await screen.findByText("iPhone 15 Pro Case");
    await selectTheRow();

    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.deactivate(1) }),
    );
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: dict.products.bulk.deactivate(1),
      }),
    );
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ ids: ["product-1"], isActive: false });

    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: dict.products.bulk.activate(1),
        }),
      ).not.toBeInTheDocument(),
    );
    await selectTheRow();
    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.activate(1) }),
    );
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ ids: ["product-1"], isActive: true });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

/**
 * «Скасувати» for the last bulk action (TASK-837 / AD-PROD-33).
 *
 * The undo replays the FORWARD endpoints, once per distinct previous value — so
 * the assertions are on the request bodies of the replay: which ids go back to
 * which value, and that rows which never changed are not written at all.
 */
describe("AdminProductTable — undo the last bulk action (TASK-837)", () => {
  const P1 = "iPhone 15 Pro Case";
  const P2 = "Galaxy S24 Case";

  /** Two rows whose previous values differ on every undoable field. */
  function stubTwoRows() {
    server.use(
      http.get("*/api/products/admin/list", () =>
        HttpResponse.json({
          data: [
            {
              ...makeProductRow(),
              isActive: true,
              groupId: "group-a",
              attributes: { Колір: "Чорний" },
            },
            {
              ...makeProductRow(),
              id: "product-2",
              name: P2,
              slug: "galaxy-s24-case",
              isActive: false,
              groupId: null,
              attributes: {},
            },
          ],
          meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
        }),
      ),
      ...categoryTreeHandlers(),
      http.get("*/api/product-groups", () =>
        HttpResponse.json({
          data: [
            { id: "group-a", name: "Чохли Clear", isActive: true, axes: [] },
            { id: "group-b", name: "Чохли Silicone", isActive: true, axes: [] },
          ],
        }),
      ),
    );
  }

  /** Record every body sent to one bulk endpoint. */
  function recordPatch(path: string, status = 200) {
    const bodies: unknown[] = [];
    server.use(
      http.patch(`*/api/products/${path}`, async ({ request }) => {
        bodies.push(await request.json());
        return status === 200
          ? HttpResponse.json({ data: { updatedCount: 1 } })
          : HttpResponse.json({ message: "boom" }, { status });
      }),
    );
    return bodies;
  }

  async function selectBoth() {
    for (const name of [P1, P2]) {
      await userEvent.click(
        screen.getByRole("checkbox", {
          name: dict.products.bulk.selectRow(name),
        }),
      );
    }
  }

  const undoButton = () =>
    screen.findByRole("button", { name: dict.products.bulk.undo });

  /**
   * The control is PERSISTENT, like every other ReorderUndoButton: outside the
   * window it is aria-disabled, never unmounted — unmounting would drop a
   * keyboard user's focus to <body>.
   */
  it("offers no undo before any bulk action — the control is there, inert", async () => {
    stubTwoRows();
    renderTable();
    await screen.findByText(P1);

    expect(await undoButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("activate → undo deactivates only the row that was inactive before", async () => {
    stubTwoRows();
    const bodies = recordPatch("status");
    renderTable();
    await screen.findByText(P1);
    await selectBoth();

    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.activate(2) }),
    );
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      ids: ["product-1", "product-2"],
      isActive: true,
    });
    // The commit names the control, so a screen-reader user learns it exists.
    await waitFor(() =>
      expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
        dict.products.bulk.announceUndoAvailable(1, dict.products.bulk.undo),
      ),
    );

    const button = await undoButton();
    await waitFor(() =>
      expect(button).not.toHaveAttribute("aria-disabled", "true"),
    );
    await userEvent.click(button);

    await waitFor(() => expect(bodies).toHaveLength(2));
    // product-1 was already active — nothing to put back, so it is not written.
    expect(bodies[1]).toEqual({ ids: ["product-2"], isActive: false });
    // Used up: inert, but still mounted and still holding the focus.
    await waitFor(() =>
      expect(button).toHaveAttribute("aria-disabled", "true"),
    );
    expect(button).toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(screen.getByTestId("tree-live-polite")).toHaveTextContent(
      dict.products.bulk.announceUndone(1),
    );
  });

  it("move to group → undo sends one request per previous group, null included", async () => {
    stubTwoRows();
    const bodies = recordPatch("group");
    renderTable();
    await screen.findByText(P1);
    await selectBoth();

    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.moveToGroup(2) }),
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

    await userEvent.click(await undoButton());

    await waitFor(() => expect(bodies).toHaveLength(3));
    expect(bodies.slice(1)).toEqual([
      { ids: ["product-1"], groupId: "group-a" },
      { ids: ["product-2"], groupId: null },
    ]);
  });

  it("set colour → undo restores each row's previous colour (or clears it)", async () => {
    stubTwoRows();
    const bodies = recordPatch("color");
    renderTable();
    await screen.findByText(P1);
    await selectBoth();

    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.setColor(2) }),
    );
    await userEvent.type(
      await screen.findByLabelText(dict.products.bulk.colorDialogLabel),
      "Білий",
    );
    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.colorSubmit }),
    );
    await waitFor(() => expect(bodies).toHaveLength(1));

    await userEvent.click(await undoButton());

    await waitFor(() => expect(bodies).toHaveLength(3));
    expect(bodies.slice(1)).toEqual([
      { ids: ["product-1"], color: "Чорний" },
      { ids: ["product-2"], color: null },
    ]);
  });

  it("offers nothing after a cancelled action", async () => {
    stubTwoRows();
    const bodies = recordPatch("status");
    renderTable();
    await screen.findByText(P1);
    await selectBoth();

    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.deactivate(2) }),
    );
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: dict.common.cancel,
      }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(bodies).toHaveLength(0);
    expect(await undoButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("a failed undo keeps the offer and says so", async () => {
    stubTwoRows();
    const bodies = recordPatch("status");
    renderTable();
    await screen.findByText(P1);
    await selectBoth();

    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.activate(2) }),
    );
    await waitFor(() => expect(bodies).toHaveLength(1));

    // The replay hits a failing server.
    const failed = recordPatch("status", 500);
    await userEvent.click(await undoButton());

    await waitFor(() =>
      expect(screen.getByTestId("tree-live-assertive")).toHaveTextContent(
        dict.products.bulk.announceUndoFailed,
      ),
    );
    expect(failed).toEqual([{ ids: ["product-2"], isActive: false }]);
    // Still on offer — a second press retries what is left.
    expect(await undoButton()).not.toHaveAttribute("aria-disabled", "true");
  });

  /** Move both rows to «Чохли Silicone» through the dialog. */
  async function moveBothToGroupB() {
    await selectBoth();
    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.moveToGroup(2) }),
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
  }

  /**
   * Group endpoint answering from a script of statuses, one per call — so a
   * two-step undo can succeed on the first step and fail on the second.
   */
  function scriptedGroupPatch(statuses: number[]) {
    const bodies: unknown[] = [];
    server.use(
      http.patch("*/api/products/group", async ({ request }) => {
        bodies.push(await request.json());
        const status = statuses[bodies.length - 1] ?? 200;
        return status === 200
          ? HttpResponse.json({ data: { updatedCount: 1 } })
          : HttpResponse.json({ message: "boom" }, { status });
      }),
    );
    return bodies;
  }

  it("a partial failure keeps only the unfinished step: the retry sends just that", async () => {
    stubTwoRows();
    // forward ok · undo step 1 ok · undo step 2 fails · retry ok
    const bodies = scriptedGroupPatch([200, 200, 500, 200]);
    renderTable();
    await screen.findByText(P1);
    await moveBothToGroupB();
    await waitFor(() => expect(bodies).toHaveLength(1));

    const button = await undoButton();
    await waitFor(() =>
      expect(button).not.toHaveAttribute("aria-disabled", "true"),
    );
    await userEvent.click(button);
    await waitFor(() =>
      expect(screen.getByTestId("tree-live-assertive")).toHaveTextContent(
        dict.products.bulk.announceUndoFailed,
      ),
    );
    expect(bodies.slice(1)).toEqual([
      { ids: ["product-1"], groupId: "group-a" },
      { ids: ["product-2"], groupId: null },
    ]);

    await waitFor(() =>
      expect(button).not.toHaveAttribute("aria-disabled", "true"),
    );
    await userEvent.click(button);

    await waitFor(() => expect(bodies).toHaveLength(4));
    // product-1 already went back — it is NOT replayed a second time.
    expect(bodies[3]).toEqual({ ids: ["product-2"], groupId: null });
    await waitFor(() =>
      expect(button).toHaveAttribute("aria-disabled", "true"),
    );
  });

  describe("the offer lapses after UNDO_WINDOW_MS", () => {
    beforeEach(() => {
      // Timers advance with the wall clock too, so React Query and user-event
      // keep working; `advanceTimersByTime` jumps over the window. The
      // microtask / nextTick / setImmediate queues stay REAL: MSW's fetch
      // interception runs on them, and faking them hangs the whole run with
      // no test timeout ever firing (order-detail-view.test.tsx does the same).
      jest.useFakeTimers({
        advanceTimers: true,
        doNotFake: ["queueMicrotask", "nextTick", "setImmediate"],
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("goes inert when the window runs out, and a press then sends nothing", async () => {
      stubTwoRows();
      const bodies = recordPatch("status");
      renderTable();
      await screen.findByText(P1);
      await selectBoth();
      await userEvent.click(
        screen.getByRole("button", { name: dict.products.bulk.activate(2) }),
      );
      await waitFor(() => expect(bodies).toHaveLength(1));

      const button = await undoButton();
      await waitFor(() =>
        expect(button).not.toHaveAttribute("aria-disabled", "true"),
      );

      act(() => {
        jest.advanceTimersByTime(UNDO_WINDOW_MS);
      });

      await waitFor(() =>
        expect(button).toHaveAttribute("aria-disabled", "true"),
      );
      // Still mounted — a focused user keeps their place.
      expect(button).toBeInTheDocument();
      await userEvent.click(button);
      expect(bodies).toHaveLength(1);
    });

    it("a failed retry does not buy a fresh window: the deadline travels with the offer", async () => {
      stubTwoRows();
      // forward ok · undo step 1 ok · undo step 2 fails
      const bodies = scriptedGroupPatch([200, 200, 500]);
      renderTable();
      await screen.findByText(P1);
      await moveBothToGroupB();
      await waitFor(() => expect(bodies).toHaveLength(1));

      const button = await undoButton();
      await waitFor(() =>
        expect(button).not.toHaveAttribute("aria-disabled", "true"),
      );

      // Two thirds of the window pass before the (half-failing) undo.
      act(() => {
        jest.advanceTimersByTime(UNDO_WINDOW_MS - 10_000);
      });
      await userEvent.click(button);
      await waitFor(() => expect(bodies).toHaveLength(3));
      await waitFor(() =>
        expect(button).not.toHaveAttribute("aria-disabled", "true"),
      );

      // Past the ORIGINAL deadline, but well inside a window restarted at the
      // failure — the remaining step must no longer be on offer.
      act(() => {
        jest.advanceTimersByTime(11_000);
      });
      await waitFor(() =>
        expect(button).toHaveAttribute("aria-disabled", "true"),
      );
    });
  });

  /**
   * An undo replayed while a NEWER forward write is still in flight would land
   * first; the forward write then commits an offer that can never reach the
   * value from before both. So the control is inert until every write settles.
   */
  it("is inert while another bulk write is in flight", async () => {
    stubTwoRows();
    const bodies: unknown[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.patch("*/api/products/status", async ({ request }) => {
        bodies.push(await request.json());
        // The second forward write hangs until the test lets it go.
        if (bodies.length === 2) await gate;
        return HttpResponse.json({ data: { updatedCount: 1 } });
      }),
    );
    renderTable();
    await screen.findByText(P1);
    await selectBoth();
    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.activate(2) }),
    );
    await waitFor(() => expect(bodies).toHaveLength(1));
    const button = await undoButton();
    await waitFor(() =>
      expect(button).not.toHaveAttribute("aria-disabled", "true"),
    );

    await selectBoth();
    await userEvent.click(
      screen.getByRole("button", { name: dict.products.bulk.activate(2) }),
    );
    await waitFor(() => expect(bodies).toHaveLength(2));

    await waitFor(() =>
      expect(button).toHaveAttribute("aria-disabled", "true"),
    );
    await userEvent.click(button);
    expect(bodies).toHaveLength(2);

    // Once the newer write lands, ITS undo is on offer.
    release();
    await waitFor(() =>
      expect(button).not.toHaveAttribute("aria-disabled", "true"),
    );
    expect(bodies).toHaveLength(2);
  });
});
