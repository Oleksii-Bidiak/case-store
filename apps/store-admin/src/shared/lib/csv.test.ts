import {
  buildCsv,
  csvNumber,
  escapeCsvText,
  joinCsvSections,
  n,
  t,
} from "./csv";

/** TASK-691 — the client mirror of the API's CSV field helpers. */

describe("escapeCsvText", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ["+380", "'+380"],
    ["-1+1", "'-1+1"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\t=1+1", "'\t=1+1"],
    ["  =1+1", "'  =1+1"],
  ])("neutralises the formula %j", (input, output) => {
    expect(escapeCsvText(input)).toBe(output);
  });

  it("neutralises a CR-led formula, then quotes it for the line break", () => {
    expect(escapeCsvText("\r=1+1")).toBe('"\'\r=1+1"');
  });

  it("leaves plain Cyrillic text alone", () => {
    expect(escapeCsvText("Чохли для iPhone")).toBe("Чохли для iPhone");
  });

  it("quotes commas, semicolons, quotes and line breaks, doubling quotes", () => {
    expect(escapeCsvText("Петренко, Олена")).toBe('"Петренко, Олена"');
    expect(escapeCsvText("Чохли; кабелі")).toBe('"Чохли; кабелі"');
    expect(escapeCsvText('Чохол "Люкс"')).toBe('"Чохол ""Люкс"""');
    expect(escapeCsvText("два\nрядки")).toBe('"два\nрядки"');
  });

  it("turns a negative number passed AS TEXT into text", () => {
    expect(escapeCsvText("-4200")).toBe("'-4200");
  });
});

describe("csvNumber", () => {
  it("passes plain decimals through, negatives included", () => {
    expect(csvNumber(-4200)).toBe("-4200");
    expect(csvNumber("-4200")).toBe("-4200");
    expect(csvNumber(12.5)).toBe("12.5");
    expect(csvNumber(0)).toBe("0");
  });

  it.each(["1e3", "-1+1", "=1+1", "", " 12", "12,5"])("refuses %j", (value) => {
    expect(() => csvNumber(value)).toThrow(/not a plain decimal/);
  });

  it("refuses non-finite numbers", () => {
    expect(() => csvNumber(Infinity)).toThrow();
    expect(() => csvNumber(Number.NaN)).toThrow();
  });
});

describe("buildCsv", () => {
  it("writes the header as text and rows by cell type, CRLF-separated", () => {
    const csv = buildCsv(
      ["Показник", "Поточний"],
      [
        [t("Повернення"), n(-29888)],
        [t("=evil"), null],
      ],
    );
    expect(csv).toBe("Показник,Поточний\r\nПовернення,-29888\r\n'=evil,");
    expect(csv.startsWith("﻿")).toBe(false);
  });

  it("fails the whole file on a text value in a numeric cell", () => {
    expect(() => buildCsv(["A"], [[n("1e3")]])).toThrow();
  });

  it("separates sections with one empty line", () => {
    expect(joinCsvSections(["a,b", "c"])).toBe("a,b\r\n\r\nc");
  });
});
