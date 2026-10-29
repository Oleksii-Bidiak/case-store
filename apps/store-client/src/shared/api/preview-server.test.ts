jest.mock("next/headers", () => ({ draftMode: jest.fn(), cookies: jest.fn() }));

import { cookies } from "next/headers";
import { mockPreviewRequest } from "@/shared/test/preview-request";
import {
  readPreviewSession,
  readPreviewToken,
  resolvePreviewToken,
} from "./preview-server";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe("readPreviewSession (TASK-669)", () => {
  it("is null outside draft mode and never opens the cookie jar", async () => {
    mockPreviewRequest(null);

    await expect(readPreviewSession()).resolves.toBeNull();
    await expect(readPreviewToken()).resolves.toBeNull();
    expect(cookies).not.toHaveBeenCalled();
  });

  it("reads the token and its expiry inside draft mode", async () => {
    mockPreviewRequest("tok", "2026-10-29T12:00:00.000Z");

    await expect(readPreviewSession()).resolves.toEqual({
      token: "tok",
      expiresAt: "2026-10-29T12:00:00.000Z",
    });
    await expect(readPreviewToken()).resolves.toBe("tok");
  });
});

describe("resolvePreviewToken (TASK-669)", () => {
  it("asks the API with the token header, uncached, and returns what it opens", async () => {
    const resolved = {
      scope: "home",
      path: "/",
      expiresAt: "2026-10-29T12:00:00.000Z",
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ data: resolved }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(resolvePreviewToken("tok")).resolves.toEqual(resolved);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/preview-tokens\/resolve$/);
    expect(init.cache).toBe("no-store");
    expect(init).not.toHaveProperty("next");
    expect(init.headers).toEqual({ "x-preview-token": "tok" });
  });

  it("is null for a token the API refuses", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 404 }) as never;

    await expect(resolvePreviewToken("bad")).resolves.toBeNull();
  });

  it("is null when the API is unreachable", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("down")) as never;

    await expect(resolvePreviewToken("tok")).resolves.toBeNull();
  });
});
