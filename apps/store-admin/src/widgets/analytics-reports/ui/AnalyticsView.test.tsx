import { http, HttpResponse } from "msw";

import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AnalyticsView } from "./AnalyticsView";

/** TASK-692 — the view reads the period off the URL and the label off the API. */

const d = dict.analytics;

let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/analytics",
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockSearchParams = new URLSearchParams("");
});

describe("AnalyticsView", () => {
  it("labels the bar with the server's period (default fixture)", async () => {
    renderWithProviders(<AnalyticsView />);
    expect(
      await screen.findByText("6 вересня — 5 жовтня 2026 · 30 днів"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(d.comparedWith("7 серпня — 5 вересня")),
    ).toBeInTheDocument();
  });

  it("asks the API for the period in the URL", async () => {
    mockSearchParams = new URLSearchParams(
      "preset=custom&from=2026-08-01&to=2026-08-31",
    );
    const seen: string[] = [];
    server.use(
      http.get("*/api/admin/analytics/reports/registrations", ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({
          data: {
            period: {
              preset: "custom",
              from: "2026-08-01",
              to: "2026-08-31",
              days: 31,
              previousFrom: "2026-07-01",
              previousTo: "2026-07-31",
              previousDays: 31,
            },
            registrations: { current: 0, previous: 0, changePct: null },
            fromGuest: { current: 0, previous: 0, changePct: null },
            daily: [],
          },
        });
      }),
    );

    renderWithProviders(<AnalyticsView />);

    expect(
      await screen.findByText("1–31 серпня 2026 · 31 день"),
    ).toBeInTheDocument();
    expect(seen).toEqual(["?preset=custom&from=2026-08-01&to=2026-08-31"]);
    expect(
      screen.getByRole("button", { name: d.presetCustom }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
