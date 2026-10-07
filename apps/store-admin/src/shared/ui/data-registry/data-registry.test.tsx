import * as React from "react";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  within,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { PluralForms } from "@/shared/lib/plural";
import {
  DataRegistry,
  ExportMenu,
  REGISTRY_ROW_ACTION_WIDTH,
  useDataRegistry,
  type DataRegistryProps,
  type RegistryColumn,
  type RegistrySettingsStore,
  type RegistrySettings,
} from ".";

/**
 * The ONE registry every admin list is built on (wave 198, TASK-1043). The
 * screens differ only in columns, views, filters and bulk actions, so each
 * behaviour the owner signed off on in OrdersProposal П1–П8 is pinned here once
 * rather than twenty-two times.
 */

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => "/orders",
  useSearchParams: () => mockSearchParams,
}));

const r = dict.common.registry;
const ORDERS: PluralForms = ["замовлення", "замовлення", "замовлень"];

interface Order {
  id: string;
  number: string;
  customer: string;
  total: number;
}

const PAGE_1: Order[] = [
  { id: "a", number: "#A0000001", customer: "Оксана", total: 100 },
  { id: "b", number: "#B0000002", customer: "Ірина", total: 250 },
];
const PAGE_2: Order[] = [
  { id: "c", number: "#C0000003", customer: "Тарас", total: 30 },
  { id: "d", number: "#D0000004", customer: "Марія", total: 70 },
];

const COLUMNS: RegistryColumn<Order>[] = [
  {
    id: "number",
    label: "№",
    header: "№",
    locked: true,
    rowLink: true,
    cell: (o) => o.number,
    defaultWidth: 120,
  },
  {
    id: "customer",
    label: "Клієнт",
    header: "Клієнт",
    cell: (o) => o.customer,
    defaultWidth: 200,
  },
  {
    id: "total",
    label: "Сума",
    header: "Сума",
    align: "end",
    sortField: "total",
    cell: (o) => `${o.total} ₴`,
    footer: (rows) => `${rows.reduce((sum, o) => sum + o.total, 0)} ₴`,
    defaultWidth: 120,
  },
];

function memoryStore(initial?: RegistrySettings) {
  const store: RegistrySettingsStore & { saved: RegistrySettings[] } = {
    saved: [],
    load: jest.fn(() => initial ?? null),
    save: jest.fn((_id: string, settings: RegistrySettings) => {
      store.saved.push(settings);
    }),
  };
  return store;
}

type HarnessProps = Partial<
  Omit<DataRegistryProps<Order>, "registry" | "title" | "search">
> & {
  rows?: Order[];
  store?: RegistrySettingsStore | null;
};

function Harness({ rows = PAGE_1, store, ...props }: HarnessProps) {
  const registry = useDataRegistry({
    tableId: "orders",
    columns: COLUMNS,
    rows,
    getRowId: (o) => o.id,
    // `null` = use the real localStorage adapter.
    ...(store === null ? {} : { store: store ?? memoryStore() }),
  });
  return (
    <DataRegistry
      registry={registry}
      title="Замовлення"
      search={{
        value: "",
        placeholder: "Номер, ім'я, телефон, email або ТТН…",
        label: "Пошук замовлень",
      }}
      itemForms={ORDERS}
      getRowLabel={(o) => o.number}
      getRowHref={(o) => `/orders/${o.id}`}
      emptyState="Замовлень ще немає"
      {...props}
    />
  );
}

function setViewport(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: mobile,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const columnHeaders = () =>
  screen
    .getAllByRole("columnheader")
    .map((th) => th.getAttribute("data-column-id"))
    .filter(Boolean);

// jsdom ships no PointerEvent, so `fireEvent.pointerMove(…, { clientX })`
// would arrive without coordinates. A MouseEvent subclass carries them.
beforeAll(() => {
  if (typeof window.PointerEvent === "undefined") {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    window.PointerEvent =
      PointerEventPolyfill as unknown as typeof window.PointerEvent;
  }
});

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams("");
  setViewport(false);
});

describe("DataRegistry — header and quick views", () => {
  it("titles the screen with an h2 and renders the header actions", () => {
    renderWithProviders(
      <Harness headerActions={<button type="button">Створити</button>} />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Замовлення" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Створити" }),
    ).toBeInTheDocument();
  });

  it("renders quick views as a tablist with optional counts", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        quickViews={{
          items: [
            { id: "new", label: "Нові", count: 3 },
            { id: "all", label: "Усі" },
          ],
          activeId: "all",
          onChange,
        }}
      />,
    );
    const list = screen.getByRole("tablist", { name: r.quickViewsLabel });
    const [fresh, all] = within(list).getAllByRole("tab");
    expect(fresh).toHaveTextContent("Нові3");
    expect(fresh).toHaveAttribute("aria-selected", "false");
    expect(all).toHaveAttribute("aria-selected", "true");
    // A view without a count renders no empty badge.
    expect(all).toHaveTextContent(/^Усі$/);
    // Roving focus: only the active view is in the tab order.
    expect(all).toHaveAttribute("tabindex", "0");
    expect(fresh).toHaveAttribute("tabindex", "-1");

    await user.click(fresh);
    expect(onChange).toHaveBeenCalledWith("new");

    all.focus();
    await user.keyboard("{ArrowLeft}");
    expect(fresh).toHaveFocus();
  });

  it("ties the views to the list they switch — a tabpanel named by the active view", () => {
    renderWithProviders(
      <Harness
        quickViews={{
          items: [
            { id: "new", label: "Нові" },
            { id: "all", label: "Усі" },
          ],
          activeId: "new",
          onChange: jest.fn(),
        }}
      />,
    );
    const panel = screen.getByRole("tabpanel", { name: "Нові" });
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveAttribute("aria-controls", panel.id);
    }
    expect(within(panel).getByRole("table")).toBeInTheDocument();
  });
});

describe("DataRegistry — toolbar", () => {
  it("lays the toolbar out in the agreed order", () => {
    renderWithProviders(
      <Harness
        filters={{ count: 2, renderSheet: () => null }}
        views={{ defaultName: "Усі замовлення" }}
        onRefresh={() => {}}
      />,
    );
    const toolbar = document.querySelector(
      '[data-slot="registry-toolbar"]',
    ) as HTMLElement;
    const controls = Array.from(toolbar.querySelectorAll("input, button")).map(
      (el) => el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "",
    );
    expect(controls).toEqual([
      "Пошук замовлень",
      `${r.filters}2${r.filtersApplied(2)}`,
      r.columns,
      r.view("Усі замовлення"),
      dict.common.table.refreshAria,
    ]);
  });

  it("names the searched fields in the placeholder", () => {
    renderWithProviders(<Harness />);
    expect(
      screen.getByRole("searchbox", { name: "Пошук замовлень" }),
    ).toHaveAttribute("placeholder", "Номер, ім'я, телефон, email або ТТН…");
  });

  it("shows no count badge while no filter is applied, and opens the sheet", async () => {
    const renderSheet = jest.fn(() => null);
    const user = userEvent.setup();
    renderWithProviders(<Harness filters={{ count: 0, renderSheet }} />);
    const button = screen.getByRole("button", { name: r.filters });
    await user.click(button);
    expect(renderSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true }),
    );
  });

  it("spins and disables refresh while fetching", () => {
    renderWithProviders(<Harness onRefresh={() => {}} isRefreshing />);
    expect(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    ).toBeDisabled();
  });

  it("renders applied filters as removable chips plus «Скинути все»", async () => {
    const remove = jest.fn();
    const clearAll = jest.fn();
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <Harness
        chips={[
          { key: "pay", label: "Спосіб оплати: Післяплата", onRemove: remove },
        ]}
        onClearAllChips={clearAll}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: r.removeChipAria("Спосіб оплати: Післяплата"),
      }),
    );
    expect(remove).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: r.clearAll }));
    expect(clearAll).toHaveBeenCalled();

    rerender(<Harness chips={[]} onClearAllChips={clearAll} />);
    expect(
      screen.queryByRole("button", { name: r.clearAll }),
    ).not.toBeInTheDocument();
  });

  it("puts the summary on the left and the sort + freshness hint on the right", () => {
    renderWithProviders(
      <Harness
        summary={<>Знайдено 27 замовлень</>}
        sortLabel="створено, нові зверху"
        updatedAt={new Date("2026-09-24T15:40:00Z")}
      />,
    );
    expect(screen.getByText("Знайдено 27 замовлень")).toBeInTheDocument();
    expect(
      screen.getByText(
        `${r.summarySort("створено, нові зверху")} · ${r.summaryUpdated("18:40")}`,
      ),
    ).toBeInTheDocument();
  });
});

describe("DataRegistry — columns, density and their persistence", () => {
  it("hides a column, keeps the locked one, reorders by keyboard and switches density", async () => {
    const store = memoryStore();
    const user = userEvent.setup();
    renderWithProviders(<Harness store={store} />);
    expect(columnHeaders()).toEqual(["number", "customer", "total"]);

    await user.click(screen.getByRole("button", { name: r.columns }));
    const locked = screen.getByRole("checkbox", { name: r.columnLocked("№") });
    expect(locked).toBeChecked();
    expect(locked).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "Клієнт" }));
    expect(columnHeaders()).toEqual(["number", "total"]);

    await user.click(screen.getByRole("checkbox", { name: "Клієнт" }));
    const grip = screen.getByRole("button", { name: r.moveColumnAria("Сума") });
    grip.focus();
    await user.keyboard("{ArrowUp}");
    expect(columnHeaders()).toEqual(["number", "total", "customer"]);
    // Focus stays on the moved row's grip so the operator can keep going.
    expect(
      screen.getByRole("button", { name: r.moveColumnAria("Сума") }),
    ).toHaveFocus();

    await user.click(screen.getByRole("button", { name: r.densityCompact }));
    expect(screen.getByRole("table")).toHaveAttribute(
      "data-density",
      "compact",
    );
    expect(
      screen.getByRole("button", { name: r.densityCompact }),
    ).toHaveAttribute("aria-pressed", "true");

    const last = store.saved.at(-1);
    expect(last?.density).toBe("compact");
    expect(last?.columns.map((c) => c.id)).toEqual([
      "number",
      "total",
      "customer",
    ]);

    await user.click(screen.getByRole("button", { name: r.resetDefaults }));
    expect(columnHeaders()).toEqual(["number", "customer", "total"]);
    expect(screen.getByRole("table")).toHaveAttribute(
      "data-density",
      "comfortable",
    );
    expect(screen.getByText(r.columnsFootnote)).toBeInTheDocument();
  });

  it("restores what the store remembered", () => {
    const store = memoryStore({
      version: 1,
      columns: [
        { id: "total", visible: true },
        { id: "number", visible: true },
        { id: "customer", visible: false },
      ],
      density: "compact",
      views: [],
      activeViewId: null,
    });
    renderWithProviders(<Harness store={store} />);
    expect(columnHeaders()).toEqual(["total", "number"]);
    expect(screen.getByRole("table")).toHaveAttribute(
      "data-density",
      "compact",
    );
  });

  it("keeps working when localStorage throws on every access", async () => {
    const get = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    const set = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    try {
      const user = userEvent.setup();
      renderWithProviders(<Harness store={null} />);
      expect(screen.getAllByRole("row")).toHaveLength(3);
      await user.click(screen.getByRole("button", { name: r.columns }));
      await user.click(screen.getByRole("checkbox", { name: "Клієнт" }));
      expect(columnHeaders()).toEqual(["number", "total"]);
      expect(set).toHaveBeenCalled();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it("resizes a column from the keyboard on a focusable separator", async () => {
    const store = memoryStore();
    const user = userEvent.setup();
    renderWithProviders(<Harness store={store} />);
    const handle = screen.getByRole("separator", {
      name: r.resizeColumnAria("Клієнт"),
    });
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).toHaveAttribute("aria-valuenow", "200");
    handle.focus();
    await user.keyboard("{ArrowRight}");
    expect(handle).toHaveAttribute("aria-valuenow", "210");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(handle).toHaveAttribute("aria-valuenow", "190");
    expect(store.saved.at(-1)?.columns[1]).toMatchObject({
      id: "customer",
      width: 190,
    });
    // Never narrower than the column's floor.
    await user.keyboard("{Home}");
    expect(Number(handle.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", { name: /Клієнт/ })).toHaveStyle({
      width: `${handle.getAttribute("aria-valuenow")}px`,
    });
  });

  it("resizes with the pointer and shows the width while dragging", () => {
    renderWithProviders(<Harness />);
    const handle = screen.getByRole("separator", {
      name: r.resizeColumnAria("Клієнт"),
    });
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 160, pointerId: 1 });
    expect(screen.getByText(r.widthPx(260))).toBeInTheDocument();
    fireEvent.pointerUp(handle, { clientX: 160, pointerId: 1 });
    expect(handle).toHaveAttribute("aria-valuenow", "260");
    expect(screen.queryByText(r.widthPx(260))).not.toBeInTheDocument();
  });

  // TASK-656 (Т8): no resting line between the last column and the action
  // cell — but the last column still resizes.
  it("draws no resting separator after the last column, yet keeps it resizable", () => {
    renderWithProviders(<Harness />);
    const inner = screen.getByRole("separator", {
      name: r.resizeColumnAria("Клієнт"),
    });
    const last = screen.getByRole("separator", {
      name: r.resizeColumnAria("Сума"),
    });
    expect(inner.firstElementChild).toHaveClass("bg-muted-foreground/45");
    expect(last.firstElementChild).toHaveClass("bg-transparent");
    expect(last.firstElementChild).not.toHaveClass("bg-muted-foreground/45");
    expect(last).toHaveAttribute("tabindex", "0");
  });

  it("does not offer a resize handle on a non-resizable column", () => {
    const columns = COLUMNS.map((c) =>
      c.id === "total" ? { ...c, resizable: false } : c,
    );
    function Fixed() {
      const registry = useDataRegistry({
        tableId: "orders",
        columns,
        rows: PAGE_1,
        getRowId: (o) => o.id,
        store: memoryStore(),
      });
      return (
        <DataRegistry
          registry={registry}
          title="Замовлення"
          search={{ value: "", placeholder: "", label: "Пошук" }}
          itemForms={ORDERS}
          getRowLabel={(o) => o.number}
          emptyState="—"
        />
      );
    }
    renderWithProviders(<Fixed />);
    expect(
      screen.queryByRole("separator", { name: r.resizeColumnAria("Сума") }),
    ).not.toBeInTheDocument();
  });

  it("sorts from a sortable header and reports aria-sort", async () => {
    const onSort = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Harness sort={{ sortBy: "total", sortOrder: "asc", onSort }} />,
    );
    const header = screen.getByRole("columnheader", { name: /Сума/ });
    expect(header).toHaveAttribute("aria-sort", "ascending");
    await user.click(
      within(header).getByRole("button", {
        name: dict.common.sortByAria("Сума"),
      }),
    );
    expect(onSort).toHaveBeenCalledWith("total");
  });
});

describe("DataRegistry — selection and the bulk bar", () => {
  it("renders no bulk bar and no checkboxes when the screen is not selectable", () => {
    renderWithProviders(<Harness />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="registry-bulk-bar"]'),
    ).toBeNull();
  });

  it("shows the idle hint until something is selected, then the count and actions", async () => {
    const onExportSelected = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        selectable
        bulk={{
          idleHint: "Виберіть рядки, щоб змінити статус кількох замовлень",
          actions: <button type="button">Змінити статус…</button>,
          onExportSelected,
        }}
      />,
    );
    const bar = document.querySelector(
      '[data-slot="registry-bulk-bar"]',
    ) as HTMLElement;
    expect(bar).toHaveAttribute("data-state", "idle");
    expect(bar).toHaveTextContent(
      "Виберіть рядки, щоб змінити статус кількох замовлень",
    );
    expect(
      screen.queryByRole("button", { name: dict.common.table.clearSelection }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", { name: r.selectRowAria("#A0000001") }),
    );
    expect(bar).toHaveAttribute("data-state", "active");
    expect(bar).toHaveTextContent(r.bulkSelected("1 замовлення"));
    expect(within(bar).getByRole("status")).toHaveTextContent(
      r.bulkSelected("1 замовлення"),
    );
    expect(
      screen.getByRole("button", { name: "Змінити статус…" }),
    ).toBeInTheDocument();
    expect(screen.getByText(r.bulkKeptHint)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: r.bulkExportSelected }),
    );
    expect(onExportSelected).toHaveBeenCalledWith(["a"]);

    await user.click(
      screen.getByRole("button", { name: dict.common.table.clearSelection }),
    );
    expect(bar).toHaveAttribute("data-state", "idle");
  });

  it("keeps the selection across pages and drives a tri-state header per page", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <Harness selectable bulk={{ idleHint: "—" }} />,
    );
    const header = () =>
      screen.getByRole("checkbox", { name: dict.common.table.selectAll });

    await user.click(
      screen.getByRole("checkbox", { name: r.selectRowAria("#A0000001") }),
    );
    expect(header()).toHaveAttribute("aria-checked", "mixed");
    await user.click(
      screen.getByRole("checkbox", { name: r.selectRowAria("#B0000002") }),
    );
    expect(header()).toHaveAttribute("aria-checked", "true");

    // Page 2: nothing of THIS page is selected, but the two stay selected.
    rerender(<Harness selectable bulk={{ idleHint: "—" }} rows={PAGE_2} />);
    expect(header()).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByText(r.bulkSelected("2 замовлення")),
    ).toBeInTheDocument();

    await user.click(header());
    expect(header()).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByText(r.bulkSelected("4 замовлення")),
    ).toBeInTheDocument();

    // Back on page 1, its rows are still ticked.
    rerender(<Harness selectable bulk={{ idleHint: "—" }} rows={PAGE_1} />);
    expect(
      screen.getByRole("checkbox", { name: r.selectRowAria("#A0000001") }),
    ).toBeChecked();
  });

  it("tints a selected row", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness selectable bulk={{ idleHint: "—" }} />);
    await user.click(
      screen.getByRole("checkbox", { name: r.selectRowAria("#A0000001") }),
    );
    const row = screen
      .getByRole("checkbox", { name: r.selectRowAria("#A0000001") })
      .closest("tr");
    expect(row).toHaveAttribute("data-state", "selected");
  });
});

describe("DataRegistry — row navigation", () => {
  it("opens the record on a row click, through a real link in the row", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    // Middle-click / open-in-new-tab need an actual anchor.
    expect(screen.getByRole("link", { name: "#A0000001" })).toHaveAttribute(
      "href",
      "/orders/a",
    );
    await user.click(screen.getByText("Оксана"));
    expect(mockPush).toHaveBeenCalledWith("/orders/a");
  });

  it("opens a new tab on Ctrl+click and on a middle click", () => {
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    renderWithProviders(<Harness />);
    fireEvent.click(screen.getByText("Оксана"), { ctrlKey: true });
    fireEvent(
      screen.getByText("Ірина"),
      new MouseEvent("auxclick", { bubbles: true, button: 1 }),
    );
    expect(open).toHaveBeenNthCalledWith(1, "/orders/a", "_blank", "noopener");
    expect(open).toHaveBeenNthCalledWith(2, "/orders/b", "_blank", "noopener");
    expect(mockPush).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("does not navigate from the checkbox or the «⋯» menu", async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        selectable
        bulk={{ idleHint: "—" }}
        rowActions={(o) => [
          { label: "Скопіювати номер", onSelect: () => onSelect(o.id) },
          {
            label: "Відкрити в новій вкладці",
            href: `/orders/${o.id}`,
            newTab: true,
          },
          {
            label: "Видалити",
            onSelect: () => {},
            destructive: true,
            separatorBefore: true,
          },
        ]}
        rowActionsLabel={(o) => `Дії із замовленням ${o.number}`}
      />,
    );
    await user.click(
      screen.getByRole("checkbox", { name: r.selectRowAria("#A0000001") }),
    );
    const trigger = screen.getByRole("button", {
      name: "Дії із замовленням #A0000001",
    });
    await user.click(trigger);
    const tab = screen.getByRole("menuitem", {
      name: "Відкрити в новій вкладці",
    });
    expect(tab).toHaveAttribute("href", "/orders/a");
    expect(tab).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("menuitem", { name: "Видалити" })).toHaveAttribute(
      "data-variant",
      "destructive",
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Скопіювати номер" }),
    );
    expect(onSelect).toHaveBeenCalledWith("a");
    expect(mockPush).not.toHaveBeenCalled();
  });

  // TASK-656 (ProductsProposal Т8): «Відновити» in a view of deleted records.
  it("puts an inline rowAction in the trailing cell — not a column «Колонки» can hide", async () => {
    const onRestore = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        rowAction={(o) =>
          o.id === "a" ? (
            <button type="button" onClick={() => onRestore(o.id)}>
              Відновити
            </button>
          ) : null
        }
      />,
    );

    // One per row that has it, in the last cell of that row.
    const buttons = screen.getAllByRole("button", { name: "Відновити" });
    expect(buttons).toHaveLength(1);
    const row = screen.getByText("Оксана").closest("tr")!;
    expect(row.lastElementChild).toContainElement(buttons[0]);
    expect(columnHeaders()).toEqual(["number", "customer", "total"]);

    // A control: it acts, and the row does not navigate.
    await user.click(buttons[0]);
    expect(onRestore).toHaveBeenCalledWith("a");
    expect(mockPush).not.toHaveBeenCalled();

    // «Колонки» lists only the declared columns.
    await user.click(screen.getByRole("button", { name: r.columns }));
    expect(
      screen.queryByRole("checkbox", { name: "Відновити" }),
    ).not.toBeInTheDocument();
  });

  // Verifier, TASK-656: at 96 px the button's right border met the table's
  // rounded edge and was clipped. The cell is now as wide as the constant the
  // screens budget against, with a gutter on both sides of the button.
  it("gives the inline rowAction a wider trailing cell with a gutter", () => {
    renderWithProviders(
      <Harness rowAction={() => <button type="button">Відновити</button>} />,
    );
    const row = screen.getByText("Оксана").closest("tr")!;
    const cell = row.lastElementChild as HTMLElement;
    expect(cell).toHaveClass("w-28", "pr-2", "pl-1");
    expect(REGISTRY_ROW_ACTION_WIDTH).toBe(112);
    const table = screen.getByRole("table");
    const cols = table.querySelectorAll("col");
    expect(cols[cols.length - 1]).toHaveClass("w-28");
  });

  // Wave 198 (MessagesProposal З5): a record that opens in a side sheet.
  it("opens in place with onRowOpen — not from its controls — and tints rows", async () => {
    const onRowOpen = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        getRowHref={undefined}
        onRowOpen={onRowOpen}
        rowClassName={(o) => (o.id === "a" ? "bg-primary/6" : undefined)}
        selectable
        bulk={{ idleHint: "—" }}
      />,
    );
    await user.click(screen.getByText("Оксана"));
    expect(onRowOpen).toHaveBeenCalledWith(PAGE_1[0]);
    await user.click(
      screen.getByRole("checkbox", { name: r.selectRowAria("#B0000002") }),
    );
    expect(onRowOpen).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText("Оксана").closest("tr")).toHaveClass(
      "bg-primary/6",
    );
    expect(screen.getByText("Ірина").closest("tr")).not.toHaveClass(
      "bg-primary/6",
    );
  });
});

describe("DataRegistry — mobile cards and totals", () => {
  it("renders the caller's cards instead of the table below md, keeping pagination", () => {
    setViewport(true);
    renderWithProviders(
      <Harness
        renderCard={(o, { actions }) => (
          <div>
            <span>{o.number}</span>
            {actions}
          </div>
        )}
        rowActions={() => [{ label: "Відкрити", href: "/x" }]}
        rowActionsLabel={(o) => `Дії ${o.number}`}
        pagination={{ page: 1, totalPages: 2, pageSize: 20 }}
      />,
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Замовлення" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Дії #A0000001" }),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.common.pageOf(1, 2))).toBeInTheDocument();
  });

  it("hands a card its inline rowAction through parts.actions (TASK-656, Т12)", () => {
    setViewport(true);
    renderWithProviders(
      <Harness
        renderCard={(o, { actions }) => (
          <div>
            <span>{o.number}</span>
            {actions}
          </div>
        )}
        rowAction={(o) => (
          <button type="button">{`Відновити ${o.number}`}</button>
        )}
      />,
    );
    const card = screen.getByRole("listitem", { name: "#A0000001" });
    expect(
      within(card).getByRole("button", { name: "Відновити #A0000001" }),
    ).toBeInTheDocument();
  });

  it("selects the whole page from the card list, as the table header does", async () => {
    setViewport(true);
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        selectable
        bulk={{ idleHint: "—" }}
        renderCard={(o, { select }) => (
          <div>
            {select}
            <span>{o.number}</span>
          </div>
        )}
      />,
    );
    const all = screen.getByRole("checkbox", {
      name: dict.common.table.selectAll,
    });
    await user.click(all);
    expect(all).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByText(r.bulkSelected("2 замовлення")),
    ).toBeInTheDocument();
  });

  it("navigates from a card tap", async () => {
    setViewport(true);
    const user = userEvent.setup();
    renderWithProviders(
      <Harness renderCard={(o) => <span>{o.customer}</span>} />,
    );
    await user.click(screen.getByText("Ірина"));
    expect(mockPush).toHaveBeenCalledWith("/orders/b");
  });

  it("adds a totals row computed from the rows on the page", () => {
    renderWithProviders(<Harness totals />);
    const footer = document.querySelector("tfoot") as HTMLElement;
    expect(footer).toHaveTextContent(r.totalsOnPage("2 замовлення"));
    expect(footer).toHaveTextContent("350 ₴");
    // Hidden on phones: a totals line under a card list reads as a card.
    expect(footer).toHaveClass("hidden", "md:table-footer-group");
  });

  // TASK-656 (Т8): «Видалених на сторінці: 3» instead of «Разом …».
  it("lets the screen name the totals row with totalsLabel", () => {
    renderWithProviders(
      <Harness
        totals
        totalsLabel={(count) => `Видалених на сторінці: ${count}`}
      />,
    );
    const footer = document.querySelector("tfoot") as HTMLElement;
    expect(footer).toHaveTextContent("Видалених на сторінці: 2");
    expect(footer).not.toHaveTextContent(r.totalsOnPage("2 замовлення"));
  });

  // TASK-656 (Т1/Т8): the label starts under «Назва», not under «Фото».
  it("starts the totals label under the column named by totalsLabelFrom", () => {
    renderWithProviders(<Harness totals totalsLabelFrom="customer" />);
    const cells = Array.from(
      document.querySelectorAll("tfoot td"),
    ) as HTMLTableCellElement[];
    // «№» stays empty; the label covers «Клієнт»; «Сума» keeps its footer.
    expect(cells).toHaveLength(3);
    expect(cells[0]).toBeEmptyDOMElement();
    expect(cells[0].colSpan).toBe(1);
    expect(cells[1]).toHaveTextContent(r.totalsOnPage("2 замовлення"));
    expect(cells[1].colSpan).toBe(1);
    expect(cells[2]).toHaveTextContent("350 ₴");
  });

  it("ignores a totalsLabelFrom that comes after the first footer", () => {
    renderWithProviders(<Harness totals totalsLabelFrom="total" />);
    const cells = Array.from(
      document.querySelectorAll("tfoot td"),
    ) as HTMLTableCellElement[];
    expect(cells[0]).toHaveTextContent(r.totalsOnPage("2 замовлення"));
    expect(cells[0].colSpan).toBe(2);
    expect(cells[1]).toHaveTextContent("350 ₴");
  });
});

/**
 * Wave 198, AuditLogProposal Ж1/Ж2: a feed grouped by day whose rows open a
 * detail panel in place instead of navigating.
 */
describe("DataRegistry — row groups and detail panels", () => {
  const ROWS: Order[] = [...PAGE_1, ...PAGE_2];
  const byHalf = (o: Order) =>
    o.id < "c"
      ? { key: "first", label: "Сьогодні" }
      : { key: "second", label: "Вчора" };

  it("heads each run of rows with its group, once", () => {
    renderWithProviders(<Harness rows={ROWS} groupBy={byHalf} />);
    const heads = screen.getAllByRole("columnheader", {
      name: /Сьогодні|Вчора/,
    });
    expect(heads.map((th) => th.textContent)).toEqual(["Сьогодні", "Вчора"]);
    expect(heads[0]).toHaveAttribute("scope", "colgroup");
  });

  it("opens a row's panel from its toggle and from a click on the row", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        rows={PAGE_1}
        getRowHref={undefined}
        renderExpanded={(o) => (o.id === "a" ? <p>Деталі {o.number}</p> : null)}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: r.expandRowAria("#A0000001"),
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // A row with nothing to open gets no toggle.
    expect(
      screen.queryByRole("button", { name: r.expandRowAria("#B0000002") }),
    ).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByText("Деталі #A0000001");
    expect(toggle).toHaveAttribute(
      "aria-controls",
      panel.closest("td")?.getAttribute("id"),
    );

    await user.click(screen.getByText("Оксана"));
    expect(screen.queryByText("Деталі #A0000001")).not.toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("groups the cards too, below md", () => {
    setViewport(true);
    renderWithProviders(
      <Harness
        rows={ROWS}
        groupBy={byHalf}
        renderCard={(o) => <span>{o.customer}</span>}
      />,
    );
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Сьогодні", "Вчора"]);
    expect(
      within(screen.getByRole("list", { name: "Замовлення" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(4);
  });
});

describe("DataRegistry — states", () => {
  it("shows a skeleton in the table's own shape while loading", () => {
    renderWithProviders(<Harness rows={[]} isLoading />);
    const skeleton = document.querySelector(
      '[data-slot="registry-skeleton"]',
    ) as HTMLElement;
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(within(skeleton).getAllByRole("row")).toHaveLength(6);
    expect(screen.queryByText("Замовлень ще немає")).not.toBeInTheDocument();
  });

  it("offers «Повторити» on an error", async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        rows={[]}
        isError
        errorMessage="Не вдалося завантажити замовлення."
        onRetry={onRetry}
      />,
    );
    expect(
      screen.getByText("Не вдалося завантажити замовлення."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: dict.canon.retry }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("tells «nothing yet» apart from «nothing for this search» and «nothing for these filters»", () => {
    const { rerender } = renderWithProviders(<Harness rows={[]} />);
    expect(screen.getByText("Замовлень ще немає")).toBeInTheDocument();

    rerender(<Harness rows={[]} searchQuery="usb" />);
    expect(screen.getByText(r.noResults("usb"))).toBeInTheDocument();

    rerender(<Harness rows={[]} isFiltered />);
    expect(
      screen.getByText(dict.common.table.emptyFiltered),
    ).toBeInTheDocument();
  });

  it("dims the table under a spinner while refetching, keeping the rows", () => {
    renderWithProviders(<Harness isRefetching />);
    expect(
      document.querySelector('[data-slot="registry-refetch"]'),
    ).toBeInTheDocument();
    expect(screen.getByText("Оксана")).toBeInTheDocument();
  });
});

describe("DataRegistry — saved views", () => {
  it("saves the current view under a name and lists it in «Мої види»", async () => {
    mockSearchParams = new URLSearchParams("paymentMethod=ON_DELIVERY&page=3");
    const store = memoryStore();
    const user = userEvent.setup();
    renderWithProviders(
      <Harness store={store} views={{ defaultName: "Усі замовлення" }} />,
    );
    await user.click(
      screen.getByRole("button", { name: r.view("Усі замовлення") }),
    );
    expect(screen.getByText(r.myViews)).toBeInTheDocument();
    expect(screen.getByText(r.viewsFootnote)).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: r.saveView }));

    const dialog = screen.getByRole("dialog", { name: r.saveViewTitle });
    await user.click(
      within(dialog).getByRole("button", { name: dict.common.save }),
    );
    // An empty name is refused with a reason, not silently ignored.
    expect(within(dialog).getByText(r.viewNameRequired)).toBeInTheDocument();
    await user.type(
      within(dialog).getByRole("textbox", { name: r.viewNameLabel }),
      "Післяплата",
    );
    await user.click(
      within(dialog).getByRole("button", { name: dict.common.save }),
    );

    expect(
      screen.getByRole("button", { name: r.view("Післяплата") }),
    ).toBeInTheDocument();
    // The page number is not part of a view.
    expect(store.saved.at(-1)?.views[0]).toMatchObject({
      name: "Післяплата",
      query: "paymentMethod=ON_DELIVERY",
    });
  });

  it("applies a view by rewriting the URL", async () => {
    const store = memoryStore({
      version: 1,
      columns: [
        { id: "number", visible: true },
        { id: "customer", visible: false },
        { id: "total", visible: true },
      ],
      density: "comfortable",
      views: [
        {
          id: "v1",
          name: "Без ТТН",
          query: "noTtn=1",
          columns: [
            { id: "number", visible: true },
            { id: "customer", visible: true },
            { id: "total", visible: false },
          ],
          sort: null,
          density: "compact",
        },
      ],
      activeViewId: null,
    });
    const user = userEvent.setup();
    renderWithProviders(
      <Harness store={store} views={{ defaultName: "Усі замовлення" }} />,
    );
    await user.click(
      screen.getByRole("button", { name: r.view("Усі замовлення") }),
    );
    await user.click(screen.getByRole("menuitemradio", { name: "Без ТТН" }));
    expect(mockReplace).toHaveBeenCalledWith("/orders?noTtn=1");
    expect(columnHeaders()).toEqual(["number", "customer"]);
    expect(screen.getByRole("table")).toHaveAttribute(
      "data-density",
      "compact",
    );

    await user.click(screen.getByRole("button", { name: r.view("Без ТТН") }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "Усі замовлення" }),
    );
    expect(mockReplace).toHaveBeenLastCalledWith("/orders");
  });

  it("renames and deletes views in «Керувати видами…»", async () => {
    const store = memoryStore({
      version: 1,
      columns: [],
      density: "comfortable",
      views: [
        {
          id: "v1",
          name: "Без ТТН",
          query: "noTtn=1",
          columns: [],
          sort: null,
          density: "comfortable",
        },
      ],
      activeViewId: null,
    });
    const user = userEvent.setup();
    renderWithProviders(
      <Harness store={store} views={{ defaultName: "Усі замовлення" }} />,
    );
    await user.click(
      screen.getByRole("button", { name: r.view("Усі замовлення") }),
    );
    await user.click(screen.getByRole("menuitem", { name: r.manageViews }));
    const dialog = screen.getByRole("dialog", { name: r.manageViewsTitle });
    const name = within(dialog).getByRole("textbox", {
      name: r.renameViewAria("Без ТТН"),
    });
    await user.clear(name);
    await user.type(name, "Без накладної");
    await user.tab();
    expect(store.saved.at(-1)?.views[0].name).toBe("Без накладної");

    await user.click(
      within(dialog).getByRole("button", {
        name: r.deleteViewAria("Без накладної"),
      }),
    );
    expect(store.saved.at(-1)?.views).toEqual([]);
    expect(within(dialog).getByText(r.noSavedViews)).toBeInTheDocument();
  });
});

describe("DataRegistry — «Вид» names the active quick view (TASK-1832)", () => {
  const QUICK = [
    { id: "new", label: "Нові" },
    { id: "deleted", label: "Видалені" },
    { id: "all", label: "Усі" },
  ];
  const renderOn = (
    activeId: string,
    views: { defaultName: string; defaultQuickViewId?: string },
    store = memoryStore(),
  ) =>
    renderWithProviders(
      <Harness
        store={store}
        quickViews={{ items: QUICK, activeId, onChange: jest.fn() }}
        views={views}
      />,
    );

  it("says «Вид: Видалені» on a quick view that is not the default", async () => {
    const user = userEvent.setup();
    renderOn("deleted", {
      defaultName: "Усі товари",
      defaultQuickViewId: "all",
    });

    const button = screen.getByRole("button", { name: r.view("Видалені") });
    await user.click(button);
    // The list on screen is neither «Мої види» entry — nothing is checked,
    // and the built-in view is still there to go back to.
    expect(
      screen.getByRole("menuitemradio", { name: "Усі товари" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("keeps the built-in name on the default quick view", async () => {
    const user = userEvent.setup();
    renderOn("all", { defaultName: "Усі товари", defaultQuickViewId: "all" });

    await user.click(
      screen.getByRole("button", { name: r.view("Усі товари") }),
    );
    expect(
      screen.getByRole("menuitemradio", { name: "Усі товари" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("keeps «Стандартний» on every tab where the screen names no default quick view", () => {
    renderOn("deleted", { defaultName: "Стандартний" });
    expect(
      screen.getByRole("button", { name: r.view("Стандартний") }),
    ).toBeInTheDocument();
  });

  it("lets an active saved view win over the quick view", () => {
    const store = memoryStore({
      version: 1,
      columns: [],
      density: "comfortable",
      views: [
        {
          id: "v1",
          name: "Мої видалені",
          query: "deleted=only",
          columns: [],
          sort: null,
          density: "comfortable",
        },
      ],
      activeViewId: "v1",
    });
    renderOn(
      "deleted",
      { defaultName: "Усі товари", defaultQuickViewId: "all" },
      store,
    );
    expect(
      screen.getByRole("button", { name: r.view("Мої видалені") }),
    ).toBeInTheDocument();
  });
});

describe("ExportMenu", () => {
  it("exports what is found, in the visible column order, in the formats on offer only", async () => {
    const onExport = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ExportMenu
        foundLabel="27 замовлень"
        selectedIds={[]}
        columns={["number", "total"]}
        formats={["csv"]}
        onExport={onExport}
      />,
    );
    await user.click(screen.getByRole("button", { name: r.exportLabel }));
    expect(screen.getByText(r.exportWhat)).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", {
        name: r.exportFound("27 замовлень"),
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemradio", { name: r.exportSelectedOnly }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.queryByRole("menuitem", { name: r.exportXlsx }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(r.exportFootnote)).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: r.exportCsv }));
    expect(onExport).toHaveBeenCalledWith({
      scope: "found",
      format: "csv",
      columns: ["number", "total"],
      selectedIds: [],
    });
  });

  it("can export only the selected rows once there are some", async () => {
    const onExport = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ExportMenu
        foundLabel="27 замовлень"
        selectedIds={["a", "b"]}
        columns={["number"]}
        formats={["xlsx", "csv"]}
        onExport={onExport}
      />,
    );
    await user.click(screen.getByRole("button", { name: r.exportLabel }));
    await user.click(
      screen.getByRole("menuitemradio", { name: r.exportSelectedOnly }),
    );
    // Picking the scope keeps the menu open — the format is the commit.
    await user.click(screen.getByRole("menuitem", { name: r.exportXlsx }));
    expect(onExport).toHaveBeenCalledWith({
      scope: "selected",
      format: "xlsx",
      columns: ["number"],
      selectedIds: ["a", "b"],
    });
  });

  it("is a no-op shell when a screen offers no format", () => {
    renderWithProviders(
      <ExportMenu
        foundLabel="1"
        selectedIds={[]}
        columns={[]}
        formats={[]}
        onExport={() => {}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: r.exportLabel }),
    ).not.toBeInTheDocument();
  });
});

// Silence act() noise from Radix focus management in a couple of flows above.
afterEach(() => {
  act(() => {});
});

void React;
