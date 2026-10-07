import {
  CASES_ID,
  OUTSIDERS_TOTAL,
  brandReport,
  categoryReport,
  emptySalesReport,
  funnelOff,
  funnelReport,
  productsReport,
  registrationsReport,
  salesReport,
  unsoldCategoryReport,
} from "@/shared/test/analytics-report-fixtures";
import { dict } from "@/shared/config";
import {
  brandsCsv,
  categoriesCsv,
  funnelCsv,
  productsCsv,
  registrationsCsv,
  salesCsv,
} from "./csv";

/** TASK-691 — each report's file is what its card shows, row for row. */

const d = dict.analytics;
const lines = (csv: string) => csv.split("\r\n");
const FILE_DAYS = "2026-09-06_2026-10-05";

describe("salesCsv", () => {
  const { filename, csv } = salesCsv(salesReport());
  const rows = lines(csv);

  it("names the file after the report and the server's days", () => {
    expect(filename).toBe(`sales-${FILE_DAYS}.csv`);
  });

  it("writes the summary, refunds as negative numbers like the screen", () => {
    expect(rows[0]).toBe(
      [d.csvMetric, d.csvCurrent, d.csvPrevious, `"${d.csvChange}"`].join(","),
    );
    expect(rows[1]).toBe(`${d.salesTile},412300,368100,12`);
    expect(rows[2]).toBe(`${d.refundsTile},-18400,-15460,19`);
    expect(rows[3]).toBe(`${d.netTile},393900,352640,11.7`);
    expect(rows[4]).toBe(`${d.ordersTile},176,161,9.3`);
    expect(rows[5]).toBe(`${d.aovTile},2238,2190,2.2`);
  });

  it("then a blank line and the daily run, a negative day unescaped", () => {
    expect(rows[6]).toBe("");
    expect(rows[7]).toBe(
      [d.csvDate, d.salesTile, d.refundsTile, d.netTile].join(","),
    );
    expect(rows[8]).toBe("2026-09-06,10000,-500,9500");
    expect(rows).toContain("2026-09-24,0,-1299,-1299");
    expect(csv).not.toContain("'-");
    expect(rows).toHaveLength(8 + 30);
  });

  it("has no daily run in an empty period, where the screen has no chart", () => {
    const empty = lines(salesCsv(emptySalesReport()).csv);
    expect(empty).toHaveLength(6);
    expect(empty[1]).toBe(`${d.salesTile},0,368100,-100`);
    expect(empty.join("\n")).not.toContain(d.csvDate);
  });
});

describe("categoriesCsv", () => {
  const roots = categoryReport();
  const children = categoryReport(CASES_ID);

  it("writes the roots with revenue when the screen shows it", () => {
    const { filename, csv } = categoriesCsv({
      period: roots.period,
      rows: roots.rows,
      showRevenue: true,
      expanded: new Set(),
      childrenOf: () => undefined,
    });
    expect(filename).toBe(`categories-${FILE_DAYS}.csv`);
    expect(lines(csv)).toEqual([
      `${d.colCategory},${d.csvParent},"${d.colUnits}",${d.colOrders},${d.colRevenue}`,
      "Чохли,,214,131,168400",
      "Смартфони,,3,3,104997",
      "Навушники,,2,2,3900",
    ]);
  });

  it("includes the open children under their root, with the direct row's label", () => {
    const { csv } = categoriesCsv({
      period: roots.period,
      rows: roots.rows,
      showRevenue: true,
      expanded: new Set([CASES_ID]),
      childrenOf: (id) => (id === CASES_ID ? children.rows : undefined),
    });
    expect(lines(csv).slice(1, 5)).toEqual([
      "Чохли,,214,131,168400",
      "Чохли для iPhone,Чохли,132,84,109200",
      "Чохли для Samsung,Чохли,51,33,36900",
      `"${d.directRow("Чохли")}",Чохли,31,20,22300`,
    ]);
  });

  it("leaves an open root's children out until they have loaded", () => {
    const { csv } = categoriesCsv({
      period: roots.period,
      rows: roots.rows,
      showRevenue: true,
      expanded: new Set([CASES_ID]),
      childrenOf: () => undefined,
    });
    expect(lines(csv)).toHaveLength(4);
  });

  it("has no revenue column without the right", () => {
    const bare = categoryReport(null, { revenue: false });
    const { csv } = categoriesCsv({
      period: bare.period,
      rows: bare.rows,
      showRevenue: false,
      expanded: new Set(),
      childrenOf: () => undefined,
    });
    expect(lines(csv)[0]).not.toContain(d.colRevenue);
    expect(lines(csv)[1]).toBe("Чохли,,214,131");
  });

  it("writes only the header when nothing sold, as the screen shows no rows", () => {
    const unsold = unsoldCategoryReport();
    const { csv } = categoriesCsv({
      period: unsold.period,
      rows: unsold.rows,
      showRevenue: true,
      expanded: new Set(),
      childrenOf: () => undefined,
    });
    expect(lines(csv)).toHaveLength(1);
  });
});

describe("brandsCsv", () => {
  it("names the brandless «Без бренду» and keeps revenue only when shown", () => {
    const withMoney = brandsCsv(brandReport(), true);
    expect(withMoney.filename).toBe(`brands-${FILE_DAYS}.csv`);
    expect(lines(withMoney.csv)).toEqual([
      `${d.colBrand},"${d.colUnits}",${d.colOrders},${d.colRevenue}`,
      "Spigen,120,80,96000",
      `${d.noBrand},14,9,4200`,
    ]);

    const bare = brandsCsv(brandReport({ revenue: false }), false);
    expect(lines(bare.csv)[0]).not.toContain(d.colRevenue);
    expect(lines(bare.csv)[2]).toBe(`${d.noBrand},14,9`);
  });
});

describe("productsCsv", () => {
  it("writes the top five, the outsiders shown and their total", () => {
    const { filename, csv } = productsCsv(productsReport(5), 5);
    const rows = lines(csv);
    expect(filename).toBe(`products-${FILE_DAYS}.csv`);
    expect(rows[0]).toBe(d.csvLeaders);
    expect(rows[1]).toBe(
      `${d.csvRank},${d.csvProduct},${d.csvUnits},${d.colOrders},${d.colRevenue}`,
    );
    expect(rows[2]).toBe("1,Apple iPhone 16 Pro,1,1,54999");
    expect(rows[7]).toBe("");
    expect(rows[8]).toBe(d.csvOutsiders);
    expect(rows[9]).toBe(`${d.csvProduct},"${d.csvStock}",${d.csvAdded}`);
    expect(rows[10]).toBe("Товар без продажів 1,12,2026-03-10");
    expect(rows.slice(-2)).toEqual([d.csvOutsidersTotal, `${OUTSIDERS_TOTAL}`]);
  });

  it("follows the expanded outsider list, leaders still five", () => {
    const { csv } = productsCsv(productsReport(OUTSIDERS_TOTAL), 5);
    const rows = lines(csv);
    expect(
      rows.filter((row) => row.startsWith("Товар без продажів")),
    ).toHaveLength(OUTSIDERS_TOTAL);
    expect(rows.filter((row) => /^\d,/.test(row))).toHaveLength(5);
  });

  it("drops revenue without the right", () => {
    const { csv } = productsCsv(productsReport(5, { revenue: false }), 5);
    expect(csv).not.toContain(d.colRevenue);
    expect(lines(csv)[2]).toMatch(
      /^1,Чохол Spigen Liquid Air для iPhone 15,22,22$/,
    );
  });
});

describe("funnelCsv", () => {
  it("writes steps, transitions and conversion in percent", () => {
    const file = funnelCsv(funnelReport());
    expect(file?.filename).toBe(`funnel-${FILE_DAYS}.csv`);
    const rows = lines(file?.csv ?? "");
    expect(rows[0]).toBe(
      `${d.csvStep},${d.csvCurrent},${d.csvPrevious},"${d.csvChange}"`,
    );
    expect(rows[1]).toBe(`${d.stepAddToCart},1240,1100,12.7`);
    expect(rows).toContain(d.csvTransitions);
    expect(rows).toContain(`${d.stepAddToCart},${d.stepBeginCheckout},49,47`);
    expect(rows.at(-1)).toBe(`${d.funnelTitle},14.2,12.8`);
  });

  it("offers no file when Umami is off or silent", () => {
    expect(funnelCsv(funnelOff(false, false))).toBeNull();
    expect(funnelCsv(funnelOff(false, true))).toBeNull();
  });
});

describe("registrationsCsv", () => {
  it("writes the two figures, then the days", () => {
    const { filename, csv } = registrationsCsv(registrationsReport());
    const rows = lines(csv);
    expect(filename).toBe(`registrations-${FILE_DAYS}.csv`);
    expect(rows[1]).toBe(`${d.registrationsNew},48,40,20`);
    expect(rows[2]).toBe(`${d.registrationsFromGuest},11,11,0`);
    expect(rows[3]).toBe("");
    expect(rows[4]).toBe(`${d.csvDate},${d.csvRegistrationsDay}`);
    expect(rows[5]).toBe("2026-09-06,0");
    expect(rows).toHaveLength(5 + 30);
  });
});
