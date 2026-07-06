import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminFaqTable } from "./faq-list";

function faqListResponse() {
  return {
    data: [
      {
        id: "faq-1",
        question: "Скільки коштує доставка?",
        answer: "Безкоштовно від 1 000 ₴.",
        sortOrder: 0,
        isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "faq-2",
        question: "Яка гарантія на техніку?",
        answer: "Від 12 до 24 місяців.",
        sortOrder: 1,
        isActive: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

describe("AdminFaqTable (TASK-242)", () => {
  it("renders the fetched FAQ items with their status", async () => {
    server.use(
      http.get("*/api/admin/faq", () => HttpResponse.json(faqListResponse())),
    );

    renderWithProviders(<AdminFaqTable />);

    expect(
      await screen.findByText("Скільки коштує доставка?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Яка гарантія на техніку?")).toBeInTheDocument();
    // Active item shows the "shown" badge; inactive shows "hidden".
    expect(screen.getByText(dict.faq.statusActive)).toBeInTheDocument();
    expect(screen.getByText(dict.faq.statusInactive)).toBeInTheDocument();
  });

  it("shows the empty state when there are no items", async () => {
    server.use(
      http.get("*/api/admin/faq", () => HttpResponse.json({ data: [] })),
    );

    renderWithProviders(<AdminFaqTable />);

    expect(await screen.findByText(dict.faq.empty)).toBeInTheDocument();
  });

  it("shows the error state when the request fails", async () => {
    server.use(
      http.get(
        "*/api/admin/faq",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    renderWithProviders(<AdminFaqTable />);

    expect(await screen.findByText(dict.faq.loadError)).toBeInTheDocument();
  });
});
