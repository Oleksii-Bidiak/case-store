jest.mock("next/headers", () => ({ draftMode: jest.fn(), cookies: jest.fn() }));
jest.mock("@/shared/api/preview-server", () => ({
  resolvePreviewToken: jest.fn(),
}));

import type { NextRequest } from "next/server";
import { cookies, draftMode } from "next/headers";
import { resolvePreviewToken } from "@/shared/api/preview-server";
import { GET as enterPreview } from "./route";
import { GET as exitPreview } from "./exit/route";

const draft = { isEnabled: false, enable: jest.fn(), disable: jest.fn() };
const jar = { set: jest.fn(), delete: jest.fn() };
const resolve = jest.mocked(resolvePreviewToken);

function request(url: string): NextRequest {
  return { nextUrl: new URL(url, "http://localhost:3000") } as NextRequest;
}

beforeEach(() => {
  jest.mocked(draftMode).mockResolvedValue(draft as never);
  jest.mocked(cookies).mockResolvedValue(jar as never);
});

afterEach(() => jest.clearAllMocks());

describe("GET /preview (TASK-669)", () => {
  const EXPIRES = "2026-10-29T12:00:00.000Z";

  it("asks the API, enables draft mode, stores the token until it expires and redirects to the resolved path", async () => {
    resolve.mockResolvedValue({
      scope: "product:p1",
      path: "/products/draft-case",
      expiresAt: EXPIRES,
    });

    const res = await enterPreview(request("/preview?token=signed"));

    expect(resolve).toHaveBeenCalledWith("signed");
    expect(draft.enable).toHaveBeenCalledTimes(1);
    expect(draft.disable).not.toHaveBeenCalled();
    expect(jar.set).toHaveBeenCalledWith(
      "preview_token",
      "signed",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        expires: new Date(EXPIRES),
      }),
    );
    expect(jar.set).toHaveBeenCalledWith(
      "preview_expires",
      EXPIRES,
      expect.objectContaining({ httpOnly: true, expires: new Date(EXPIRES) }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("/products/draft-case");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  it("does not turn draft mode on for a token the API refuses — and ends any preview this browser had", async () => {
    resolve.mockResolvedValue(null);

    const res = await enterPreview(request("/preview?token=expired"));

    expect(draft.enable).not.toHaveBeenCalled();
    expect(draft.disable).toHaveBeenCalledTimes(1);
    expect(jar.set).not.toHaveBeenCalled();
    expect(jar.delete).toHaveBeenCalledWith("preview_token");
    expect(jar.delete).toHaveBeenCalledWith("preview_expires");
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("/preview/invalid");
  });

  it("never calls the API without a token", async () => {
    const res = await enterPreview(request("/preview"));

    expect(resolve).not.toHaveBeenCalled();
    expect(draft.enable).not.toHaveBeenCalled();
    expect(res.headers.get("Location")).toBe("/preview/invalid");
  });

  it("refuses a resolved path that would leave the site", async () => {
    resolve.mockResolvedValue({
      scope: "home",
      path: "//evil.example/",
      expiresAt: EXPIRES,
    });

    const res = await enterPreview(request("/preview?token=signed"));

    expect(draft.enable).not.toHaveBeenCalled();
    expect(res.headers.get("Location")).toBe("/preview/invalid");
  });

  it("takes the destination from the API only, never from the query string", async () => {
    resolve.mockResolvedValue({ scope: "home", path: "/", expiresAt: EXPIRES });

    const res = await enterPreview(
      request("/preview?token=signed&to=https://evil.example/"),
    );

    expect(res.headers.get("Location")).toBe("/");
  });
});

describe("GET /preview/exit (TASK-669)", () => {
  it("disables draft mode, drops the token and returns to the page", async () => {
    const res = await exitPreview(
      request("/preview/exit?to=%2Fproducts%2Fdraft-case"),
    );

    expect(draft.disable).toHaveBeenCalledTimes(1);
    expect(jar.delete).toHaveBeenCalledWith("preview_token");
    expect(jar.delete).toHaveBeenCalledWith("preview_expires");
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("/products/draft-case");
  });

  it.each([
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
  ])("blocks the open redirect to %s and goes home instead", async (to) => {
    const res = await exitPreview(
      request(`/preview/exit?to=${encodeURIComponent(to)}`),
    );

    expect(res.headers.get("Location")).toBe("/");
  });

  it("goes home when no page is given", async () => {
    const res = await exitPreview(request("/preview/exit"));

    expect(res.headers.get("Location")).toBe("/");
  });
});
