import { http, HttpResponse } from "msw";

import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { moneyFlowEntry } from "@/shared/test/analytics-report-fixtures";
import type { MoneyFlowEntryEntity } from "@/entities/analytics";
import { dict } from "@/shared/config";
import { formatKop } from "@/shared/lib";
import { MINUS } from "../lib/format";
import { MoneyFlowEntriesView } from "./MoneyFlowEntries";

/**
 * TASK-2395 — the money-flow register: refused without the money rights,
 * period / kind / page from the URL, the marks an entry carries, and a CSV
 * of every page, not just the one on screen.
 */

const d = dict.analytics;
const k = dict.orderMoney.kindLabels;

const mockDownloadCsv = jest.fn();
jest.mock("@/shared/lib/download-csv", () => ({
  downloadCsv: (...args: unknown[]) => mockDownloadCsv(...args),
}));

let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/analytics/money-flow",
  useSearchParams: () => mockSearchParams,
}));

const OWNER = { auth: { isOwner: true } };
const ENTRIES = "*/api/admin/analytics/reports/money-flow/entries";

const exact = { normalizer: (text: string) => text.trim() };

/** Serve `rows` as one page; record each request's query. */
function serveEntries(
  rows: MoneyFlowEntryEntity[],
  meta = { total: rows.length, page: 1, limit: 50, totalPages: 1 },
): URLSearchParams[] {
  const seen: URLSearchParams[] = [];
  server.use(
    http.get(ENTRIES, ({ request }) => {
      seen.push(new URL(request.url).searchParams);
      return HttpResponse.json({ data: rows, meta });
    }),
  );
  return seen;
}

beforeEach(() => {
  mockSearchParams = new URLSearchParams("");
  mockDownloadCsv.mockClear();
});
afterEach(() => server.events.removeAllListeners());

describe("MoneyFlowEntries — permissions", () => {
  it.each([
    ["analytics:revenue", ["analytics:read", "payments:read"]],
    ["payments:read", ["analytics:read", "analytics:revenue"]],
  ])(
    "refuses without %s — and asks nothing of the ledger",
    async (_missing, permissions) => {
      const paths: string[] = [];
      server.events.on("request:start", ({ request }) => {
        paths.push(new URL(request.url).pathname);
      });
      renderWithProviders(<MoneyFlowEntriesView />, { auth: { permissions } });

      expect(await screen.findByRole("alert")).toHaveTextContent(
        d.moneyFlowForbidden,
      );
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(paths.filter((path) => path.includes("money-flow"))).toEqual([]);
    },
  );
});

describe("MoneyFlowEntries — the register", () => {
  it("asks for the URL's period, kind and page, 50 a page", async () => {
    mockSearchParams = new URLSearchParams(
      "preset=custom&from=2026-09-01&to=2026-09-30&kind=CASH_REFUND&page=2",
    );
    const seen = serveEntries([], {
      total: 120,
      page: 2,
      limit: 50,
      totalPages: 3,
    });
    renderWithProviders(<MoneyFlowEntriesView />, OWNER);

    expect(
      await screen.findByText(d.moneyFlowEntriesEmptyKind),
    ).toBeInTheDocument();
    const query = seen[0];
    expect(Object.fromEntries(query.entries())).toEqual({
      preset: "custom",
      from: "2026-09-01",
      to: "2026-09-30",
      kind: "CASH_REFUND",
      page: "2",
      limit: "50",
    });
    expect(screen.getByText(dict.common.pageOf(2, 3))).toBeInTheDocument();
  });

  it("drops a kind the API would refuse", async () => {
    mockSearchParams = new URLSearchParams("kind=BOGUS");
    const seen = serveEntries([]);
    renderWithProviders(<MoneyFlowEntriesView />, OWNER);

    expect(
      await screen.findByText(d.moneyFlowEntriesEmpty),
    ).toBeInTheDocument();
    expect(seen[0].has("kind")).toBe(false);
  });

  it("links the order and marks сторно, LiqPay-pending, late entry and legacy", async () => {
    serveEntries([
      moneyFlowEntry({
        id: "rev",
        kind: "COD_NOVA_POSHTA",
        signedKop: -129_900,
        isReversal: true,
        reversalOfId: "orig",
        occurredAt: "2026-09-24T10:00:00.000Z",
        createdAt: "2026-09-25T08:00:00.000Z",
        actorName: "Олена",
        reason: "Помилкове надходження",
      }),
      moneyFlowEntry({
        id: "req",
        orderId: "ord-2",
        orderNumber: "EF56GH78",
        direction: "OUT",
        kind: "LIQPAY_REFUND",
        amountKop: 50_000,
        signedKop: 50_000,
        providerState: "REQUESTED",
        requested: true,
      }),
      moneyFlowEntry({
        id: "old",
        kind: "BANK_TRANSFER",
        legacy: true,
      }),
    ]);
    renderWithProviders(<MoneyFlowEntriesView />, OWNER);

    const rows = await screen.findAllByTestId("money-flow-entry");
    expect(rows).toHaveLength(3);

    const reversal = within(rows[0]);
    expect(
      reversal.getByRole("link", { name: d.moneyFlowOrderAria("AB12CD34") }),
    ).toHaveAttribute("href", "/orders/ord-1");
    expect(reversal.getByText(d.moneyFlowMarkReversal)).toBeInTheDocument();
    expect(
      reversal.getByText(d.moneyFlowMarkCreated("25.09")),
    ).toBeInTheDocument();
    expect(
      reversal.getByText(`${MINUS}${formatKop(129_900)}`, exact),
    ).toBeInTheDocument();
    expect(reversal.getByText("Олена")).toBeInTheDocument();
    expect(reversal.getByText("Помилкове надходження")).toBeInTheDocument();

    const pending = within(rows[1]);
    expect(pending.getByText(k.LIQPAY_REFUND)).toBeInTheDocument();
    expect(pending.getByText(d.moneyFlowMarkRequested)).toBeInTheDocument();
    expect(pending.getByText(formatKop(50_000), exact)).toBeInTheDocument();
    expect(pending.getByText(dict.orderMoney.actorLiqPay)).toBeInTheDocument();

    const legacy = within(rows[2]);
    expect(legacy.getByText(d.moneyFlowMarkLegacy)).toBeInTheDocument();
    // Written the moment it moved — no «Внесено».
    expect(legacy.queryByText(/^Внесено/)).not.toBeInTheDocument();
  });
});

describe("MoneyFlowEntries — CSV", () => {
  it("pages through every entry (500 a request) into one file", async () => {
    const pages: Record<string, MoneyFlowEntryEntity[]> = {
      "1": [moneyFlowEntry({ id: "a" })],
      "2": [
        moneyFlowEntry({
          id: "b",
          direction: "OUT",
          kind: "TRANSFER_REFUND",
          amountKop: 50_000,
          signedKop: 50_000,
          actorName: "Олена",
          reason: "Повернення, домовились",
        }),
      ],
      "3": [
        moneyFlowEntry({
          id: "c",
          direction: "OUT",
          kind: "LIQPAY_REFUND",
          amountKop: 50_000,
          signedKop: -50_000,
          isReversal: true,
          requested: true,
        }),
      ],
    };
    const csvPages: string[] = [];
    server.use(
      http.get(ENTRIES, ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get("limit") === "500") {
          const page = params.get("page") ?? "1";
          csvPages.push(page);
          return HttpResponse.json({
            data: pages[page] ?? [],
            meta: { total: 3, page: Number(page), limit: 500, totalPages: 3 },
          });
        }
        return HttpResponse.json({
          data: pages["1"],
          meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
        });
      }),
    );
    renderWithProviders(<MoneyFlowEntriesView />, OWNER);

    const button = screen.getByRole("button", {
      name: d.csvAria(d.moneyFlowEntriesHeading),
    });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await waitFor(() => expect(mockDownloadCsv).toHaveBeenCalledTimes(1));

    expect(csvPages).toEqual(["1", "2", "3"]);
    const [csv, filename] = mockDownloadCsv.mock.calls[0] as [string, string];
    expect(filename).toBe("money-flow-entries-2026-09-06_2026-10-05.csv");
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "Дата руху,Внесено,Замовлення,Напрям,Спосіб,Сума,Стан,Автор,Причина",
    );
    expect(lines).toHaveLength(4);
    // 12:00 UTC is 15:00 in Kyiv in September.
    expect(lines[1]).toBe(
      `2026-09-24 15:00,2026-09-24 15:00,#AB12CD34,Надходження,${k.LIQPAY_PAYMENT},1299,,${dict.orderMoney.actorLiqPay},`,
    );
    // Money out is negative…
    expect(lines[2]).toContain(
      `Повернення,${k.TRANSFER_REFUND},-500,,Олена,"Повернення, домовились"`,
    );
    // …and its сторно flips back to positive.
    expect(lines[3]).toContain(
      `Повернення,${k.LIQPAY_REFUND},500,"${d.moneyFlowMarkReversal}; ${d.moneyFlowMarkRequestedFull}",`,
    );
  });
});
