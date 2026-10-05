import { http, HttpResponse } from "msw";
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { server } from "@/shared/test/msw-server";
import type { CarouselEntity } from "@/shared/api";
import {
  DuplicateCarouselItemsError,
  duplicateCarouselPayload,
  useDuplicateCarousel,
} from "./use-duplicate-carousel";

const SOURCE = {
  id: "src-1",
  title: "Редакція обирає",
  source: "MANUAL",
  placement: "HOME_RAILS",
  categoryId: null,
  itemLimit: 12,
  sortOrder: 0,
  status: "PUBLISHED",
  publishedAt: null,
  scheduledAt: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
} as unknown as CarouselEntity;

function renderDuplicate() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useDuplicateCarousel(), { wrapper });
}

describe("duplicateCarouselPayload", () => {
  it("keeps a long title within the API's 255 characters", () => {
    const payload = duplicateCarouselPayload({
      ...SOURCE,
      title: "Я".repeat(255),
    });
    expect(payload.title.length).toBeLessThanOrEqual(255);
    expect(payload.title.endsWith("(копія)")).toBe(true);
  });
});

describe("useDuplicateCarousel", () => {
  it("says the copy exists when only its hand-picked list failed", async () => {
    server.use(
      http.post("*/api/admin/carousels", () =>
        HttpResponse.json({ data: { ...SOURCE, id: "copy-1" } }),
      ),
      http.get("*/api/admin/carousels/src-1/items", () =>
        HttpResponse.json({
          data: [{ id: "i1", productId: "p1", sortOrder: 0 }],
        }),
      ),
      http.put("*/api/admin/carousels/:id/items", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    const { result } = renderDuplicate();

    const failure = await result.current.duplicate(SOURCE).catch((e) => e);
    expect(failure).toBeInstanceOf(DuplicateCarouselItemsError);
    expect((failure as DuplicateCarouselItemsError).copyId).toBe("copy-1");
  });

  it("rejects with an ordinary error when the copy itself was not created", async () => {
    server.use(
      http.post("*/api/admin/carousels", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    const { result } = renderDuplicate();

    const failure = await result.current.duplicate(SOURCE).catch((e) => e);
    expect(failure).not.toBeInstanceOf(DuplicateCarouselItemsError);
  });
});
