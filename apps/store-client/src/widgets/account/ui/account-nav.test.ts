import { FEATURE_STUBS } from "@/shared/config";
import {
  ACCOUNT_NAV,
  activeAccountNavKey,
  isAccountOrderDetailPath,
  parseAccountSection,
} from "./account-nav";

/** TASK-867 / TASK-217 — the account menu is addressed by the URL. */
describe("account nav model", () => {
  it("links every entry: sections by ?section=, orders inside the account", () => {
    const hrefs = Object.fromEntries(ACCOUNT_NAV.map((e) => [e.key, e.href]));
    expect(hrefs).toMatchObject({
      profile: "/account",
      orders: "/account/orders",
      favorites: "/wishlist",
      purchases: "/account?section=purchases",
      history: "/account?section=history",
      bonuses: "/account?section=bonuses",
      settings: "/account?section=settings",
    });
  });

  it("parses known sections and falls back to the profile", () => {
    expect(parseAccountSection("settings")).toBe("settings");
    expect(parseAccountSection("bonuses")).toBe("bonuses");
    expect(parseAccountSection(null)).toBe("profile");
    expect(parseAccountSection("")).toBe("profile");
    expect(parseAccountSection("orders")).toBe("profile");
    expect(parseAccountSection("bogus")).toBe("profile");
  });

  it("does not reach «Порівняння» by URL while its entry is hidden", () => {
    expect(parseAccountSection("compare")).toBe(
      FEATURE_STUBS ? "compare" : "profile",
    );
  });

  it("marks the orders entry for the list and every order detail", () => {
    expect(activeAccountNavKey("/account/orders", null)).toBe("orders");
    expect(activeAccountNavKey("/account/orders/abc-123", "settings")).toBe(
      "orders",
    );
    expect(activeAccountNavKey("/account", "settings")).toBe("settings");
    expect(activeAccountNavKey("/account", "nope")).toBe("profile");
    expect(activeAccountNavKey("/wishlist", null)).toBeNull();
  });

  it("recognises only a real id segment as the order detail", () => {
    expect(isAccountOrderDetailPath("/account/orders/abc-123")).toBe(true);
    expect(isAccountOrderDetailPath("/account/orders")).toBe(false);
    expect(isAccountOrderDetailPath("/account/orders/")).toBe(false);
    expect(isAccountOrderDetailPath("/account")).toBe(false);
  });
});
