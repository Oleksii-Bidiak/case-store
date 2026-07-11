import { POST } from "./route";
import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { submitToIndexNow } from "@/shared/lib/seo/indexnow";
import { SITE_URL } from "@/shared/config";

// Calling the real revalidateTag/revalidatePath outside a request scope is
// unsafe/undefined in a plain Jest node environment — mock them out.
jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
  revalidatePath: jest.fn(),
}));

// `after` is only meaningful inside a real Next request scope; invoke the
// callback synchronously so the test can observe the scheduled work.
// NextResponse passes through from the real module.
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: jest.fn((callback: () => void) => callback()),
}));

jest.mock("@/shared/lib/seo/indexnow", () => ({
  submitToIndexNow: jest.fn().mockResolvedValue(undefined),
}));

const mockSubmitToIndexNow = submitToIndexNow as jest.MockedFunction<
  typeof submitToIndexNow
>;
const mockAfter = after as jest.MockedFunction<typeof after>;
const mockRevalidateTag = revalidateTag as unknown as jest.Mock;
const mockRevalidatePath = revalidatePath as unknown as jest.Mock;

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

/** NODE_ENV is typed readonly in Next's ProcessEnv — flip via cast. */
function setNodeEnv(value: string): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

function makeRequest(body?: unknown, secret?: string): Request {
  return new Request("http://localhost:3000/api/revalidate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-revalidate-secret": secret } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REVALIDATE_SECRET = "test-secret";
  });

  afterEach(() => {
    setNodeEnv(ORIGINAL_NODE_ENV ?? "test");
    delete process.env.REVALIDATE_SECRET;
  });

  describe("secret handling (regression)", () => {
    it("returns 503 when the secret is not configured in production", async () => {
      delete process.env.REVALIDATE_SECRET;
      setNodeEnv("production");

      const res = await POST(makeRequest({ tags: ["blog"] }));

      expect(res.status).toBe(503);
      expect(mockRevalidateTag).not.toHaveBeenCalled();
      expect(mockAfter).not.toHaveBeenCalled();
    });

    it("returns 200 no-op when the secret is not configured in dev", async () => {
      delete process.env.REVALIDATE_SECRET;

      const res = await POST(makeRequest({ tags: ["blog"] }));

      expect(res.status).toBe(200);
      expect(mockRevalidateTag).not.toHaveBeenCalled();
      expect(mockSubmitToIndexNow).not.toHaveBeenCalled();
    });

    it("returns 401 on a missing secret header", async () => {
      const res = await POST(makeRequest({ tags: ["blog"] }));

      expect(res.status).toBe(401);
      expect(mockRevalidateTag).not.toHaveBeenCalled();
      expect(mockAfter).not.toHaveBeenCalled();
    });

    it("returns 401 on a mismatched secret", async () => {
      const res = await POST(makeRequest({ tags: ["blog"] }, "wrong"));

      expect(res.status).toBe(401);
      expect(mockSubmitToIndexNow).not.toHaveBeenCalled();
    });
  });

  describe("revalidation + IndexNow wiring", () => {
    it("pings IndexNow with absolute URLs for a valid request with paths", async () => {
      const res = await POST(
        makeRequest({ paths: ["/blog", "/blog/x"] }, "test-secret"),
      );

      expect(res.status).toBe(200);
      expect(mockRevalidatePath).toHaveBeenCalledTimes(2);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/blog");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/blog/x");
      expect(mockAfter).toHaveBeenCalledTimes(1);
      expect(mockSubmitToIndexNow).toHaveBeenCalledTimes(1);
      expect(mockSubmitToIndexNow).toHaveBeenCalledWith([
        `${SITE_URL}/blog`,
        `${SITE_URL}/blog/x`,
      ]);
    });

    it("does not ping IndexNow for a tags-only request", async () => {
      const res = await POST(makeRequest({ tags: ["faq"] }, "test-secret"));

      expect(res.status).toBe(200);
      expect(mockRevalidateTag).toHaveBeenCalledTimes(1);
      expect(mockRevalidateTag).toHaveBeenCalledWith("faq");
      expect(mockAfter).not.toHaveBeenCalled();
      expect(mockSubmitToIndexNow).not.toHaveBeenCalled();
    });

    it("skips empty-string paths when building IndexNow URLs", async () => {
      const res = await POST(
        makeRequest({ paths: ["", "/promo"] }, "test-secret"),
      );

      expect(res.status).toBe(200);
      expect(mockRevalidatePath).toHaveBeenCalledTimes(1);
      expect(mockSubmitToIndexNow).toHaveBeenCalledWith([`${SITE_URL}/promo`]);
    });

    it("returns 200 without pinging IndexNow for an empty body", async () => {
      const res = await POST(makeRequest({}, "test-secret"));

      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        data: { revalidated: boolean; tags: string[]; paths: string[] };
      };
      expect(json.data.revalidated).toBe(true);
      expect(json.data.tags).toEqual([]);
      expect(json.data.paths).toEqual([]);
      expect(mockAfter).not.toHaveBeenCalled();
      expect(mockSubmitToIndexNow).not.toHaveBeenCalled();
    });

    it("treats an unparsable body as empty (200, no ping)", async () => {
      const res = await POST(makeRequest(undefined, "test-secret"));

      expect(res.status).toBe(200);
      expect(mockSubmitToIndexNow).not.toHaveBeenCalled();
    });
  });
});
