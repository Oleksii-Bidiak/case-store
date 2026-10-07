import { dict } from "@/shared/config";
import { HELP_SECTIONS, joinPhrases, resolveHelpSection } from "./help-content";

/**
 * TASK-1035 — every nav section has its own «Довідка розділу»; none silently
 * falls back to the dashboard's text.
 */
const NAV_ROUTES = [
  // TASK-692.
  "/analytics",
  "/products",
  "/catalog-import",
  "/product-groups",
  "/categories",
  "/brands",
  "/addon-services",
  "/devices/brands",
  "/discounts",
  "/pages",
  "/blog",
  "/banners",
  "/carousels",
  "/media",
  "/orders",
  "/returns",
  "/reviews",
  "/messages",
  "/users",
  "/staff",
  "/subscribers",
  "/content-map",
  "/settings/contact",
  "/settings/seo",
  "/settings/search",
  "/settings/delivery",
  "/faq",
  "/audit-log",
  "/profile",
];

describe("resolveHelpSection", () => {
  it.each(NAV_ROUTES)("has its own entry for %s", (route) => {
    expect(resolveHelpSection(route).prefix).not.toBe("/");
  });

  it("resolves the dashboard exactly", () => {
    expect(resolveHelpSection("/").title).toBe(dict.nav.dashboard);
  });

  it("covers sub-routes by their section", () => {
    expect(resolveHelpSection("/orders/abc").title).toBe(dict.nav.orders);
    expect(resolveHelpSection("/devices/models/m-1").title).toBe(
      dict.nav.devices,
    );
    expect(resolveHelpSection("/blog/categories").title).toBe(dict.nav.blog);
  });

  it("falls back to the panel-wide entry for an unknown route", () => {
    expect(resolveHelpSection("/nowhere").prefix).toBe("/");
  });

  it("gives every section something to say", () => {
    for (const section of HELP_SECTIONS) {
      expect(section.what.length).toBeGreaterThan(0);
    }
  });
});

describe("joinPhrases", () => {
  it.each([
    [[], ""],
    [["a"], "a"],
    [["a", "b"], "a й b"],
    [["a", "b", "c"], "a, b й c"],
  ])("joins %j as %j", (phrases, expected) => {
    expect(joinPhrases(phrases)).toBe(expected);
  });
});
