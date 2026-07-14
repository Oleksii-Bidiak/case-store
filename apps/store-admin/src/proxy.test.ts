import { NextRequest } from "next/server";
import { proxy, config } from "./proxy";
import { ADMIN_UI_SESSION_COOKIE } from "@/shared/config/admin-ui-session";

function request(url: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(url, "https://admin.example.com"));
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

describe("admin proxy (edge guard)", () => {
  it("lets a request with the session marker through", () => {
    const res = proxy(request("/products", { [ADMIN_UI_SESSION_COOKIE]: "1" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects to /login when there is no session marker", () => {
    const res = proxy(request("/products"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("remembers where the user was headed", () => {
    const res = proxy(request("/orders/42?tab=items"));

    const location = new URL(res.headers.get("location") as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/orders/42?tab=items");
  });

  // An RSC payload URL is not somewhere a human can be sent back to; echoing one
  // into `next` would land the admin on a payload route after signing in.
  it("does not echo an RSC prefetch URL into the return path", () => {
    const res = proxy(request("/orders?_rsc=abc123"));

    const location = new URL(res.headers.get("location") as string);
    expect(location.searchParams.has("next")).toBe(false);
  });

  // The matcher is load-bearing: without the negative lookahead the proxy runs on
  // every request including static assets, and the login page it redirects to
  // would be stripped of its own CSS and JS.
  it("excludes /login and static assets from the matcher", () => {
    const [pattern] = config.matcher;
    const matches = (path: string) => new RegExp(`^${pattern}$`).test(path);

    expect(matches("/products")).toBe(true);
    expect(matches("/login")).toBe(false);
    expect(matches("/_next/static/chunk.js")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
  });
});
