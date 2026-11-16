import { http, HttpResponse } from "msw";

import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { emptyMoneyFlowReport } from "@/shared/test/analytics-report-fixtures";
import { dict } from "@/shared/config";
import { formatKop } from "@/shared/lib";
import { MINUS } from "../lib/format";
import { AnalyticsView } from "./AnalyticsView";

/**
 * TASK-2395 — «Рух коштів» on /analytics: only with `analytics:revenue` AND
 * `payments:read` (no card, no request otherwise); in · out · net, the eight
 * kinds linking into the register, the «станом на зараз» balances, the CSV.
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
  usePathname: () => "/analytics",
  useSearchParams: () => mockSearchParams,
}));

const OWNER = { auth: { isOwner: true } };
const MONEY_FLOW_PATH = "/api/admin/analytics/reports/money-flow";

/** `formatCurrency` holds NBSPs the default normalizer would flatten. */
const exact = { normalizer: (text: string) => text.trim() };

function recordRequests(): string[] {
  const paths: string[] = [];
  server.events.on("request:start", ({ request }) => {
    paths.push(new URL(request.url).pathname);
  });
  return paths;
}

const block = () => screen.findByRole("region", { name: d.moneyFlowTitle });

beforeEach(() => {
  mockSearchParams = new URLSearchParams("");
  mockDownloadCsv.mockClear();
});
afterEach(() => server.events.removeAllListeners());

describe("MoneyFlowReport — permissions", () => {
  it.each([
    ["analytics:revenue", ["analytics:read", "analytics:revenue"]],
    ["payments:read", ["analytics:read", "payments:read"]],
  ])(
    "is absent without %s — and the ledger is never asked for",
    async (_missing, permissions) => {
      const paths = recordRequests();
      renderWithProviders(<AnalyticsView />, { auth: { permissions } });

      const registrations = screen.getByRole("region", {
        name: d.registrationsTitle,
      });
      expect(await within(registrations).findByText("48")).toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: d.moneyFlowTitle }),
      ).not.toBeInTheDocument();
      expect(paths).not.toContain(MONEY_FLOW_PATH);
    },
  );

  it("is there with both rights, right after «Продажі»", async () => {
    renderWithProviders(<AnalyticsView />, {
      auth: {
        permissions: ["analytics:read", "analytics:revenue", "payments:read"],
      },
    });
    expect(await block()).toBeInTheDocument();
    const titles = screen
      .getAllByRole("region")
      .map(
        (region) =>
          document.getElementById(region.getAttribute("aria-labelledby") ?? "")
            ?.textContent,
      );
    expect(titles.slice(0, 2)).toEqual([d.salesTitle, d.moneyFlowTitle]);
  });
});

describe("MoneyFlowReport — the figures", () => {
  it("shows in · out (with a minus) · net, and the LiqPay-pending part", async () => {
    renderWithProviders(<AnalyticsView />, OWNER);
    const region = await block();

    expect(
      await within(region).findByText(formatKop(35_870_150), exact),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(`${MINUS}${formatKop(1_969_900)}`, exact),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(formatKop(33_900_250), exact),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(
        d.moneyFlowRequested(`${MINUS}${formatKop(250_000)}`),
        exact,
      ),
    ).toBeInTheDocument();
  });

  it("lists the eight kinds in two groups, each a link into the register", async () => {
    mockSearchParams = new URLSearchParams("preset=7d");
    renderWithProviders(<AnalyticsView />, OWNER);
    const region = await block();
    const table = await within(region).findByRole("table", {
      name: d.moneyFlowKindsAria,
    });

    expect(table.querySelectorAll("tr[data-kind]")).toHaveLength(8);
    expect(
      within(table).getByRole("columnheader", { name: d.moneyFlowGroupIn }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: d.moneyFlowGroupOut }),
    ).toBeInTheDocument();

    const cod = table.querySelector('tr[data-kind="COD_NOVA_POSHTA"]');
    expect(cod).not.toBeNull();
    const codRow = within(cod as HTMLElement);
    expect(
      codRow.getByRole("link", {
        name: d.moneyFlowRowLinkAria(k.COD_NOVA_POSHTA),
      }),
    ).toHaveAttribute(
      "href",
      "/analytics/money-flow?preset=7d&kind=COD_NOVA_POSHTA",
    );
    // Сторно takes from money in…
    expect(
      codRow.getByText(`${MINUS}${formatKop(129_900)}`, exact),
    ).toBeInTheDocument();
    // …and money out reads as money taken away.
    const refund = within(
      table.querySelector('tr[data-kind="LIQPAY_REFUND"]') as HTMLElement,
    );
    expect(
      refund.getAllByText(`${MINUS}${formatKop(1_840_000)}`, exact),
    ).toHaveLength(2);

    expect(
      within(region).getByRole("link", { name: d.moneyFlowAllEntries }),
    ).toHaveAttribute("href", "/analytics/money-flow?preset=7d");
  });

  it("shows the balances as of now, linked to the order list", async () => {
    renderWithProviders(<AnalyticsView />, OWNER);
    const region = await block();
    const now = await within(region).findByRole("group", {
      name: d.moneyFlowNowTitle,
    });

    expect(within(now).getByText(d.moneyFlowNowHint)).toBeInTheDocument();
    const debt = within(now).getByRole("link", {
      name: new RegExp(d.moneyFlowDebt),
    });
    expect(debt).toHaveAttribute("href", "/orders?hasDebt=true");
    expect(
      within(debt).getByText(d.moneyFlowBalance(3, formatKop(459_800)), exact),
    ).toBeInTheDocument();
    const owed = within(now).getByRole("link", {
      name: new RegExp(d.moneyFlowOwed),
    });
    expect(owed).toHaveAttribute("href", "/orders?owedToCustomer=true");
    expect(
      within(owed).getByText(d.moneyFlowBalance(2, formatKop(129_950)), exact),
    ).toBeInTheDocument();
  });

  it("says an empty period in one line — zeros, no table, no error", async () => {
    server.use(
      http.get("*/api/admin/analytics/reports/money-flow", () =>
        HttpResponse.json({ data: emptyMoneyFlowReport() }),
      ),
    );
    renderWithProviders(<AnalyticsView />, OWNER);
    const region = await block();

    expect(
      await within(region).findByText(d.moneyFlowEmpty),
    ).toBeInTheDocument();
    expect(within(region).queryByRole("table")).not.toBeInTheDocument();
    expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
    expect(
      within(region).queryByText(/очікує підтвердження LiqPay/),
    ).not.toBeInTheDocument();
  });
});

describe("MoneyFlowReport — CSV", () => {
  it("saves the summary: cyrillic header, money in hryvnias, out negative", async () => {
    renderWithProviders(<AnalyticsView />, OWNER);
    const region = await block();
    const button = within(region).getByRole("button", {
      name: d.csvAria(d.moneyFlowTitle),
    });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(mockDownloadCsv).toHaveBeenCalledTimes(1);
    const [csv, filename] = mockDownloadCsv.mock.calls[0] as [string, string];
    expect(filename).toBe("money-flow-2026-09-06_2026-10-05.csv");

    const lines = csv.split("\r\n");
    expect(lines[0]).toBe('Показник,Поточний,Попередній,"Зміна, %"');
    expect(lines).toContain("Надійшло,358701.5,320000,12.1");
    expect(lines).toContain("Повернуто,-19699,-15460,27.4");
    expect(lines).toContain("Рух нетто,339002.5,304540,11.3");
    expect(lines).toContain(`${d.csvRequestedRow},-2500,0,`);
    expect(lines).toContain("Напрям,Спосіб,Сума,Сторно,Нетто,Записів");
    expect(lines).toContain(
      `Надходження,${k.COD_NOVA_POSHTA},90000,-1299,88701,41`,
    );
    expect(lines).toContain(`Повернення,${k.LIQPAY_REFUND},-18400,0,-18400,6`);
  });
});
