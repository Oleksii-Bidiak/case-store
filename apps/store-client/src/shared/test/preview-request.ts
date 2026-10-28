import { cookies, draftMode } from "next/headers";
import {
  PREVIEW_EXPIRES_COOKIE,
  PREVIEW_TOKEN_COOKIE,
} from "@/shared/api/preview-token";

/**
 * Put the request a route test renders into, or out of, a signed preview
 * (TASK-669). The test file must mock `next/headers` itself:
 *
 *     jest.mock("next/headers", () => ({ draftMode: jest.fn(), cookies: jest.fn() }));
 *
 * `token: null` is the public request — draft mode OFF, and the cookie jar must
 * not even be opened (that is what would make a static route dynamic). A token
 * is draft mode ON with that token in the preview cookie, exactly what the
 * `/preview` route leaves behind.
 */
export function mockPreviewRequest(
  token: string | null,
  expiresAt: string | null = null,
): void {
  jest
    .mocked(draftMode)
    .mockResolvedValue({ isEnabled: token !== null } as Awaited<
      ReturnType<typeof draftMode>
    >);
  const values: Record<string, string | null> = {
    [PREVIEW_TOKEN_COOKIE]: token,
    [PREVIEW_EXPIRES_COOKIE]: expiresAt,
  };
  jest.mocked(cookies).mockImplementation((async () => {
    if (token === null) {
      throw new Error("cookies() read outside a preview");
    }
    return {
      get: (name: string) =>
        values[name] ? { name, value: values[name] } : undefined,
    };
  }) as unknown as typeof cookies);
}
