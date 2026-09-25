import {
  MAX_TABLE_COLSPAN,
  MAX_TABLE_ROWSPAN,
  clampTableSpan,
} from "./table-span";

describe("clampTableSpan (TASK-548)", () => {
  it("uses the same bounds as the API sanitizer", () => {
    expect(MAX_TABLE_COLSPAN).toBe(20);
    expect(MAX_TABLE_ROWSPAN).toBe(100);
  });

  it("caps an oversized span at its bound", () => {
    expect(clampTableSpan("colspan", "9999")).toBe(String(MAX_TABLE_COLSPAN));
    expect(clampTableSpan("rowspan", "70000")).toBe(String(MAX_TABLE_ROWSPAN));
    expect(clampTableSpan("span", "1000")).toBe(String(MAX_TABLE_COLSPAN));
  });

  it("keeps an in-range span, the boundaries included", () => {
    expect(clampTableSpan("colspan", "1")).toBe("1");
    expect(clampTableSpan("colspan", "20")).toBe("20");
    expect(clampTableSpan("rowspan", "100")).toBe("100");
  });

  it("reads the value the way a browser does", () => {
    expect(clampTableSpan("colspan", " +3px")).toBe("3");
    expect(clampTableSpan("rowspan", "007")).toBe("7");
  });

  it("removes a zero, negative or non-numeric span", () => {
    expect(clampTableSpan("rowspan", "0")).toBeNull();
    expect(clampTableSpan("colspan", "-4")).toBeNull();
    expect(clampTableSpan("colspan", "abc")).toBeNull();
    expect(clampTableSpan("colspan", "")).toBeNull();
  });

  it("leaves other attributes alone", () => {
    expect(clampTableSpan("href", "/x")).toBe("/x");
  });
});
