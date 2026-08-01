import { http, HttpResponse } from "msw";
import { server } from "@/shared/test/msw-server";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { DashboardTrafficCard } from "./DashboardTrafficCard";

const d = dict.dashboard;

const UMAMI_URL = "https://analytics.mystore.ua/websites/site-1";
const TRAFFIC_URL = "*/api/admin/analytics/traffic";

/** A configured, answering summary — the happy path (TASK-380). */
const LIVE_SUMMARY = {
  configured: true,
  available: true,
  rangeDays: 7,
  pageviews: 1240,
  visitors: 380,
  visits: 400,
  bounceRate: 0.5,
  avgVisitSeconds: 96,
  previousVisitors: 351,
};

function respondWith(summary: Record<string, unknown>) {
  server.use(http.get(TRAFFIC_URL, () => HttpResponse.json({ data: summary })));
}

describe("DashboardTrafficCard — numbers (TASK-380)", () => {
  it("renders the headline metrics and the change vs the previous week", async () => {
    respondWith(LIVE_SUMMARY);
    renderWithProviders(<DashboardTrafficCard dashboardUrl={UMAMI_URL} />);

    expect(await screen.findByText("380")).toBeInTheDocument();
    expect(screen.getByText(d.trafficVisitors)).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText(d.trafficSeconds(96))).toBeInTheDocument();
    // 380 vs 351 ≈ +8%
    expect(screen.getByText(d.trafficDeltaUp(8))).toBeInTheDocument();
    // The link stays: the card answers "how many", Umami answers "why".
    expect(
      screen.getByRole("link", { name: d.trafficOpenLinkAria }),
    ).toHaveAttribute("href", UMAMI_URL);
  });

  it("shows a drop as a negative change", async () => {
    respondWith({ ...LIVE_SUMMARY, visitors: 300, previousVisitors: 400 });
    renderWithProviders(<DashboardTrafficCard dashboardUrl={UMAMI_URL} />);

    expect(
      await screen.findByText(d.trafficDeltaDown(-25)),
    ).toBeInTheDocument();
  });

  it("renders «—» instead of zeroes for metrics with no visits", async () => {
    respondWith({
      ...LIVE_SUMMARY,
      visits: 0,
      pageviews: 0,
      visitors: 0,
      bounceRate: null,
      avgVisitSeconds: null,
      previousVisitors: null,
    });
    renderWithProviders(<DashboardTrafficCard dashboardUrl={UMAMI_URL} />);

    // Bounce rate and session length are undefined without visits; the counts
    // themselves are genuinely zero and are shown as such.
    await waitFor(() => expect(screen.getAllByText("—")).toHaveLength(2));
    expect(screen.getAllByText("0")).toHaveLength(2);
  });

  it("says the data is unavailable rather than drawing zeroes", async () => {
    respondWith({
      configured: true,
      available: false,
      rangeDays: 7,
      pageviews: null,
      visitors: null,
      visits: null,
      bounceRate: null,
      avgVisitSeconds: null,
      previousVisitors: null,
    });
    renderWithProviders(<DashboardTrafficCard dashboardUrl={UMAMI_URL} />);

    expect(await screen.findByText(d.trafficUnavailable)).toBeInTheDocument();
    expect(screen.queryByText(d.trafficVisitors)).not.toBeInTheDocument();
  });
});

describe("DashboardTrafficCard — link-only states (TASK-262)", () => {
  it("keeps the outbound link when analytics is not wired up", async () => {
    // Default handler answers `configured: false`.
    renderWithProviders(<DashboardTrafficCard dashboardUrl={UMAMI_URL} />);

    const link = await screen.findByRole("link", {
      name: d.trafficOpenLinkAria,
    });
    expect(link).toHaveAttribute("href", UMAMI_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByText(d.trafficNotConfigured)).not.toBeInTheDocument();
  });

  it.each([
    ["prop omitted (env constant empty in tests)", undefined],
    ["explicit empty string", ""],
  ])("renders the muted copy and no link — %s", async (_label, url) => {
    renderWithProviders(<DashboardTrafficCard dashboardUrl={url} />);

    expect(screen.getByText(d.trafficHeading)).toBeInTheDocument();
    expect(await screen.findByText(d.trafficNotConfigured)).toBeInTheDocument();
    // No dead href="" link in the unconfigured state.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
