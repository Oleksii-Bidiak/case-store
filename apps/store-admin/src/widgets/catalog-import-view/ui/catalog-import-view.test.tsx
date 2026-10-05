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
import type { CatalogImportPlan } from "../model/plan-types";
import { CatalogImportView } from "./catalog-import-view";

const d = dict.catalogImport;
const r = dict.common.registry;

/** Testing Library collapses a node's whitespace (the NBSP in «1 297» too). */
const norm = (text: string) => text.replace(/\s+/g, " ");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/catalog-import",
  useSearchParams: () => new URLSearchParams(""),
}));

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

function setViewport(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: mobile,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
const originalMatchMedia = window.matchMedia;

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const OLD_RUN_ID = "22222222-2222-4222-8222-222222222222";

function makePlan(
  overrides: Partial<CatalogImportPlan> = {},
): CatalogImportPlan {
  return {
    rows: [
      {
        sourceSku: "558400004",
        rowNumber: 377,
        action: "update",
        name: "Чохол Armor Magnetic Samsung Galaxy A35",
        productId: "prod-armor",
        slug: "armor",
        changes: [
          {
            field: "price",
            label: "Ціна",
            from: "299",
            to: "349",
            conflict: true,
          },
          {
            field: "name",
            label: "Назва",
            from: "a",
            to: "b",
            conflict: false,
          },
        ],
      },
      {
        sourceSku: "N-1",
        rowNumber: 10,
        action: "create",
        name: "Бездротовий адаптер Proove Swift",
        productId: null,
        slug: "swift",
        changes: [],
      },
      {
        sourceSku: "M-1",
        rowNumber: 0,
        action: "missing",
        name: "Старий чохол",
        productId: "prod-old",
        slug: "old",
        changes: [],
      },
      {
        sourceSku: "M-2",
        rowNumber: 0,
        action: "missing",
        name: "Ще один старий чохол",
        productId: "prod-old-2",
        slug: "old-2",
        changes: [],
      },
    ],
    categories: [{ name: "Аудіо", slug: "audio", usageCount: 2 }],
    brands: [],
    deviceBrands: [],
    deviceModels: [],
    attributeColumns: [],
    groups: [],
    issues: [
      {
        level: "warning",
        rowNumber: 1102,
        sourceSku: "X",
        code: "description-truncated",
        message: "Опис обрізано до 5000 символів",
      },
      {
        level: "error",
        rowNumber: 44,
        sourceSku: null,
        code: "no-price",
        message: "Немає ціни",
      },
    ],
    counts: {
      total: 5,
      create: 1,
      update: 1,
      unchanged: 0,
      missing: 2,
      conflicts: 1,
      errors: 1,
    },
    ...overrides,
  };
}

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    filename: "ncaseua_2026-09.xlsx",
    status: "PARSED",
    totalRows: 4,
    createCount: 1,
    updateCount: 1,
    missingCount: 2,
    errorCount: 1,
    appliedRows: 0,
    plan: makePlan(),
    error: null,
    actorEmail: "admin@store.com",
    createdAt: "2026-09-30T11:38:00.000Z",
    appliedAt: null,
    ...overrides,
  };
}

interface Stub {
  uploads: number;
  applies: Record<string, unknown>[];
  cancels: number;
  listCalls: number;
}

function stubApi({
  run = makeRun(),
  duplicateOf = null as string | null,
  history = [] as Record<string, unknown>[],
  oldRun = undefined as Record<string, unknown> | undefined,
} = {}) {
  const stub: Stub = { uploads: 0, applies: [], cancels: 0, listCalls: 0 };
  let current = run;
  server.use(
    http.post("*/api/catalog-import", () => {
      stub.uploads += 1;
      return HttpResponse.json({ data: current, duplicateOf });
    }),
    http.get("*/api/catalog-import", () => {
      stub.listCalls += 1;
      return HttpResponse.json({ data: history });
    }),
    http.get(`*/api/catalog-import/${RUN_ID}`, () =>
      HttpResponse.json({ data: current }),
    ),
    http.get(`*/api/catalog-import/${OLD_RUN_ID}`, () =>
      HttpResponse.json({ data: oldRun ?? makeRun({ id: OLD_RUN_ID }) }),
    ),
    http.post(`*/api/catalog-import/${RUN_ID}/apply`, async ({ request }) => {
      stub.applies.push((await request.json()) as Record<string, unknown>);
      current = {
        ...current,
        status: "APPLYING",
        appliedRows: 1,
        totalRows: 3,
      };
      return HttpResponse.json({ data: current });
    }),
    http.post(`*/api/catalog-import/${RUN_ID}/cancel`, () => {
      stub.cancels += 1;
      current = { ...current, status: "CANCELLED" };
      return HttpResponse.json({ data: current });
    }),
  );
  return stub;
}

const xlsx = () =>
  new File(["fake"], "ncaseua_2026-09.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

async function chooseFile(file: File = xlsx()) {
  await userEvent.upload(screen.getByLabelText(d.fileInputLabel), file);
}

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
  localStorage.clear();
  setViewport(false);
});

afterAll(() => {
  window.matchMedia = originalMatchMedia;
});

describe("CatalogImportView — step «Файл» (ІК1–ІК3)", () => {
  it("offers a drop zone with «Обрати файл» and the three steps — no native picker, no «Розібрати» button", async () => {
    stubApi();
    renderWithProviders(<CatalogImportView />);

    expect(screen.getByText(d.dropTitle)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: d.pickFile }),
    ).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: d.stepsAria });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
    expect(within(steps).getByText(d.stepFile).closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(
      screen.queryByRole("button", { name: "Розібрати файл" }),
    ).not.toBeInTheDocument();
  });

  it("parses right after the file is chosen", async () => {
    const stub = stubApi();
    renderWithProviders(<CatalogImportView />);

    await chooseFile();

    await waitFor(() => expect(stub.uploads).toBe(1));
    expect(await screen.findByText("ncaseua_2026-09.xlsx")).toBeInTheDocument();
  });

  it("refuses a file that is not .xlsx without sending it", async () => {
    const stub = stubApi();
    renderWithProviders(<CatalogImportView />, {});

    await userEvent.upload(
      screen.getByLabelText(d.fileInputLabel),
      new File(["x"], "prices.csv", { type: "text/csv" }),
      { applyAccept: false },
    );

    expect(await screen.findByText(d.wrongType)).toBeInTheDocument();
    expect(stub.uploads).toBe(0);
  });
});

describe("CatalogImportView — step «Перевірка» (ІК4–ІК9)", () => {
  async function openPlan(stub = stubApi()) {
    renderWithProviders(<CatalogImportView />);
    await chooseFile();
    await screen.findByRole("tab", { name: new RegExp(d.tabChanges) });
    return stub;
  }

  it("shows the plan as tiles and tabs — with the warnings the server collected", async () => {
    await openPlan();

    for (const tab of [
      d.tabChanges,
      d.tabMissing,
      d.tabCreates,
      d.tabWarnings,
      d.tabSkipped,
      d.tabReferences,
    ]) {
      expect(
        screen.getByRole("tab", { name: new RegExp(`^${tab}`) }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText(d.tileConflicts)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(`^${d.tabWarnings}`) }),
    );
    expect(
      await screen.findByText("Опис обрізано до 5000 символів"),
    ).toBeInTheDocument();
  });

  it("marks the changed-in-admin field and links the product", async () => {
    await openPlan();

    expect(screen.getByText(d.conflictBadge)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: d.openProduct })).toHaveAttribute(
      "href",
      "/products/prod-armor",
    );
  });

  it("«Зберегти всі ручні правки» unticks every change over a hand edit — the same action, renamed", async () => {
    const stub = await openPlan();

    await userEvent.click(
      screen.getByRole("button", { name: d.uncheckConflicts }),
    );
    expect(screen.getByRole("checkbox", { name: /Ціна/ })).not.toBeChecked();
    expect(screen.getByText(new RegExp(d.barKeep(1)))).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: d.applyButton(4) }),
    );
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: d.apply,
      }),
    );
    await waitFor(() => expect(stub.applies).toHaveLength(1));
    expect(stub.applies[0]).toEqual({
      excludedSkus: [],
      excludedFields: { "558400004": ["price"] },
    });
  });

  it("counts what will really be written — an unticked row leaves the counter", async () => {
    await openPlan();
    expect(
      screen.getByRole("button", { name: d.applyButton(4) }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(`^${d.tabMissing}`) }),
    );
    await userEvent.click(
      await screen.findByRole("checkbox", { name: /Старий чохол/ }),
    );

    expect(
      screen.getByRole("button", { name: d.applyButton(3) }),
    ).toBeInTheDocument();
  });

  it("asks with a summary before applying — cancel sends nothing (was window.confirm)", async () => {
    const confirmSpy = jest.spyOn(window, "confirm");
    const stub = await openPlan();

    await userEvent.click(
      screen.getByRole("button", { name: d.applyButton(4) }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(d.applyTitle(4));
    expect(dialog).toHaveTextContent(d.applyCreates(1));
    expect(dialog).toHaveTextContent(d.applyMissing(2));
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );

    expect(stub.applies).toHaveLength(0);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("rejects the parse through an AlertDialog naming the file", async () => {
    const stub = await openPlan();

    await userEvent.click(screen.getByRole("button", { name: d.rejectButton }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(d.cancelTitle("ncaseua_2026-09.xlsx"));
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.cancelAction }),
    );

    await waitFor(() => expect(stub.cancels).toBe(1));
    expect(await screen.findByText(d.dropTitle)).toBeInTheDocument();
  });

  it("lists new products as a table with the article", async () => {
    await openPlan();

    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(`^${d.tabCreates}`) }),
    );
    const table = await screen.findByRole("table", { name: d.tabCreates });
    expect(
      within(table).getByText("Бездротовий адаптер Proove Swift"),
    ).toBeInTheDocument();
    expect(within(table).getByText("N-1")).toBeInTheDocument();
  });

  it("refreshes the history after each action", async () => {
    const stub = await openPlan();
    await waitFor(() => expect(stub.listCalls).toBeGreaterThanOrEqual(2));
  });
});

describe("CatalogImportView — the same file again (ІК10)", () => {
  it("says there is nothing to apply and links the earlier import", async () => {
    stubApi({
      run: makeRun({
        createCount: 0,
        updateCount: 0,
        missingCount: 0,
        plan: makePlan({
          rows: [],
          issues: [],
          counts: {
            total: 0,
            create: 0,
            update: 0,
            unchanged: 3,
            missing: 0,
            conflicts: 0,
            errors: 0,
          },
        }),
      }),
      duplicateOf: OLD_RUN_ID,
      history: [
        makeRun({
          id: OLD_RUN_ID,
          status: "APPLIED",
          plan: undefined,
          createdAt: "2026-09-25T08:30:00.000Z",
        }),
      ],
    });
    renderWithProviders(<CatalogImportView />);
    await chooseFile();

    expect(
      await screen.findByText(d.noChanges("25.09.2026, 11:30")),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: d.openThatImport }),
    ).toBeInTheDocument();
    // Rejecting stays possible.
    expect(
      screen.getByRole("button", { name: d.rejectButton }),
    ).toBeInTheDocument();
  });
});

describe("CatalogImportView — step «Запис» (ІК11–ІК13)", () => {
  async function openRun(run: Record<string, unknown>) {
    stubApi({ run: makeRun(run), history: [makeRun(run)] });
    renderWithProviders(<CatalogImportView />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: r.rowActionsAria("ncaseua_2026-09.xlsx"),
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.historyOpen }),
    );
  }

  it("shows the progress and that the page may be closed", async () => {
    await openRun({ status: "APPLYING", appliedRows: 412, totalRows: 1297 });

    expect(
      await screen.findByText(norm(d.progress(412, 1297))),
    ).toBeInTheDocument();
    expect(screen.getByText(d.progressHint)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "412",
    );
  });

  it("says what was written, with «Нові товари (N) →»", async () => {
    await openRun({ status: "APPLIED", appliedAt: "2026-09-30T11:40:00.000Z" });

    expect(await screen.findByText(d.doneHeading)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: d.toNewProducts(1) }),
    ).toHaveAttribute("href", "/products?status=hidden");
    expect(screen.getByRole("link", { name: d.toStore })).toBeInTheDocument();
    // Opened from the history: the unticked rows are not known here, so the
    // figures are the plan's, and the screen says so.
    expect(screen.getByText(d.donePlannedNote)).toBeInTheDocument();
  });

  it("explains a failure in words, keeps the raw text folded, and offers a retry", async () => {
    await openRun({
      status: "FAILED",
      appliedRows: 412,
      totalRows: 1297,
      error: "Can't reach database server at `postgres:5432`",
    });

    expect(await screen.findByText(d.failedDb)).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: d.techDetails });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText(/Can't reach database server/),
    ).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByText(/Can't reach database server/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: d.retry })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: d.startOver }),
    ).toBeInTheDocument();
  });
});

describe("CatalogImportView — history (ІК1)", () => {
  it("is a table with status labels and the result in words", async () => {
    stubApi({
      history: [
        makeRun({
          status: "APPLIED",
          createCount: 1297,
          updateCount: 0,
          missingCount: 0,
        }),
        makeRun({ id: OLD_RUN_ID, status: "CANCELLED", filename: "old.xlsx" }),
      ],
    });
    renderWithProviders(<CatalogImportView />);

    // The skeleton is a table too — wait for the rows, then take the table.
    await screen.findByText("old.xlsx");
    const table = screen.getByRole("table", { name: d.historyHeading });
    expect(within(table).getByText(d.status.APPLIED)).toBeInTheDocument();
    expect(within(table).getByText(d.status.CANCELLED)).toBeInTheDocument();
    expect(
      within(table).getByText(norm(d.resultCreated(1297))),
    ).toBeInTheDocument();
    expect(within(table).getByText(d.resultNothing)).toBeInTheDocument();
  });
});
