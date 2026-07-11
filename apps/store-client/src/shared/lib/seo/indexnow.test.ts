import {
  getIndexNowKey,
  buildIndexNowPayload,
  submitToIndexNow,
} from "./indexnow";
import { GET as getIndexNowKeyFile } from "@/app/indexnow.txt/route";
import { SITE_URL } from "@/shared/config";

/**
 * NODE_ENV is typed readonly in Next's ProcessEnv, so tests flip it through a
 * cast (plain assignment — Jest proxies process.env, so defineProperty does not
 * stick) and restore it after each test.
 */
function setNodeEnv(value: string): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const originalFetch = global.fetch;

describe("indexnow", () => {
  let fetchMock: jest.Mock;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    delete process.env.INDEXNOW_KEY;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    setNodeEnv(ORIGINAL_NODE_ENV ?? "test");
    delete process.env.INDEXNOW_KEY;
    global.fetch = originalFetch;
    warnSpy.mockRestore();
  });

  describe("getIndexNowKey", () => {
    it("returns undefined when INDEXNOW_KEY is unset", () => {
      expect(getIndexNowKey()).toBeUndefined();
    });

    it("returns undefined for a whitespace-only key", () => {
      process.env.INDEXNOW_KEY = "   ";
      expect(getIndexNowKey()).toBeUndefined();
    });

    it("returns the trimmed key when set", () => {
      process.env.INDEXNOW_KEY = " abc123 ";
      expect(getIndexNowKey()).toBe("abc123");
    });

    it("reads the env fresh per call (not at module load)", () => {
      expect(getIndexNowKey()).toBeUndefined();
      process.env.INDEXNOW_KEY = "late-key";
      expect(getIndexNowKey()).toBe("late-key");
    });
  });

  describe("buildIndexNowPayload", () => {
    it("returns undefined when no key is configured", () => {
      expect(buildIndexNowPayload([`${SITE_URL}/blog`])).toBeUndefined();
    });

    it("returns undefined for an empty url list", () => {
      process.env.INDEXNOW_KEY = "abc123";
      expect(buildIndexNowPayload([])).toBeUndefined();
    });

    it("returns undefined when all urls are empty strings", () => {
      process.env.INDEXNOW_KEY = "abc123";
      expect(buildIndexNowPayload(["", ""])).toBeUndefined();
    });

    it("de-dupes repeated urls", () => {
      process.env.INDEXNOW_KEY = "abc123";
      const payload = buildIndexNowPayload([
        "http://x/a",
        "http://x/a",
        "http://x/b",
      ]);
      expect(payload?.urlList).toEqual(["http://x/a", "http://x/b"]);
    });

    it("derives host and keyLocation from SITE_URL", () => {
      process.env.INDEXNOW_KEY = "abc123";
      const payload = buildIndexNowPayload([`${SITE_URL}/blog`]);
      expect(payload).toEqual({
        host: new URL(SITE_URL).host,
        key: "abc123",
        keyLocation: `${SITE_URL}/indexnow.txt`,
        urlList: [`${SITE_URL}/blog`],
      });
    });
  });

  describe("submitToIndexNow", () => {
    it("never calls fetch outside production, even with a key and urls", async () => {
      // NODE_ENV is "test" under Jest — the gate must hold. Deliberate: without
      // it every dev save / CI run would spam api.indexnow.org.
      process.env.INDEXNOW_KEY = "abc123";
      await submitToIndexNow([`${SITE_URL}/blog`]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("never calls fetch in production without a key", async () => {
      setNodeEnv("production");
      await submitToIndexNow([`${SITE_URL}/blog`]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("POSTs the payload once when configured in production", async () => {
      setNodeEnv("production");
      process.env.INDEXNOW_KEY = "abc123";
      fetchMock.mockResolvedValue({ ok: true, status: 200 });

      await submitToIndexNow([`${SITE_URL}/blog`, `${SITE_URL}/blog`]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.indexnow.org/indexnow");
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({
        "Content-Type": "application/json; charset=utf-8",
      });
      expect(JSON.parse(init.body as string)).toEqual({
        host: new URL(SITE_URL).host,
        key: "abc123",
        keyLocation: `${SITE_URL}/indexnow.txt`,
        urlList: [`${SITE_URL}/blog`],
      });
    });

    it("resolves and warns when fetch rejects", async () => {
      setNodeEnv("production");
      process.env.INDEXNOW_KEY = "abc123";
      fetchMock.mockRejectedValue(new Error("network down"));

      await expect(
        submitToIndexNow([`${SITE_URL}/blog`]),
      ).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        "[indexnow] Submission failed:",
        expect.any(Error),
      );
    });

    it("resolves and warns on a non-2xx response", async () => {
      setNodeEnv("production");
      process.env.INDEXNOW_KEY = "abc123";
      fetchMock.mockResolvedValue({ ok: false, status: 422 });

      await expect(
        submitToIndexNow([`${SITE_URL}/blog`]),
      ).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "[indexnow] Submission rejected with status 422",
        ),
      );
    });
  });

  describe("indexnow.txt route", () => {
    it("returns 404 with no body when the key is unset", async () => {
      const res = await getIndexNowKeyFile();
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("");
    });

    it("serves the raw key as text/plain when configured", async () => {
      process.env.INDEXNOW_KEY = "abc123";
      const res = await getIndexNowKeyFile();
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("abc123");
      expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
      expect(res.headers.get("Cache-Control")).toBe(
        "public, max-age=3600, s-maxage=86400",
      );
    });
  });
});
