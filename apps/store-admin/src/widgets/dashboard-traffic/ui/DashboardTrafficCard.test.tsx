import { http, HttpResponse } from "msw";
import { server } from "@/shared/test/msw-server";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
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

describe("DashboardTrafficCard — our API failing (TASK-693 review)", () => {
  it.each([
    ["with the Umami link", UMAMI_URL],
    ["without the Umami link", ""],
  ])("offers a retry, never «не підключено» — %s", async (_label, url) => {
    server.use(
      http.get(TRAFFIC_URL, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderWithProviders(<DashboardTrafficCard dashboardUrl={url} />);

    expect(await screen.findByText(d.trafficLoadError)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.canon.retry }),
    ).toBeInTheDocument();
    expect(screen.queryByText(d.trafficNotConfigured)).not.toBeInTheDocument();
    expect(screen.queryByText(d.trafficUnavailable)).not.toBeInTheDocument();
  });

  it("shows the numbers once the retry succeeds", async () => {
    let fail = true;
    server.use(
      http.get(TRAFFIC_URL, () =>
        fail
          ? HttpResponse.json({ message: "boom" }, { status: 500 })
          : HttpResponse.json({ data: LIVE_SUMMARY }),
      ),
    );
    renderWithProviders(<DashboardTrafficCard dashboardUrl={UMAMI_URL} />);

    await screen.findByText(d.trafficLoadError);
    fail = false;
    await userEvent.click(
      screen.getByRole("button", { name: dict.canon.retry }),
    );

    expect(await screen.findByText("380")).toBeInTheDocument();
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

    // TASK-693: the heading now carries its window, «Відвідуваність · за 7 днів».
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(await screen.findByText(d.trafficNotConfigured)).toBeInTheDocument();
    // No dead href="" link in the unconfigured state.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

const UNAVAILABLE = {
  configured: true,
  available: false,
  rangeDays: 7,
  pageviews: null,
  visitors: null,
  visits: null,
  bounceRate: null,
  avgVisitSeconds: null,
  previousVisitors: null,
};

/** «Відвідуваність · за 7 днів» — the title with its window. */
const heading = `${d.trafficHeading} · ${d.trafficRange}`;
const READER = { auth: { permissions: ["analytics:read"] } };

describe("DashboardTrafficCard — the window and «Детальніше» (TASK-693)", () => {
  it("says «за 7 днів» in the title while loading", () => {
    renderWithProviders(<DashboardTrafficCard dashboardUrl={UMAMI_URL} />);
    expect(screen.getByText(d.trafficLoading)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it.each([
    ["not configured", null, d.trafficOpenLink],
    ["unavailable", UNAVAILABLE, d.trafficUnavailable],
    ["with numbers", LIVE_SUMMARY, d.trafficVisitors],
  ])(
    "says «за 7 днів» in the title, once — %s",
    async (_label, summary, marker) => {
      if (summary) respondWith(summary);
      renderWithProviders(<DashboardTrafficCard dashboardUrl={UMAMI_URL} />);

      expect(await screen.findByText(marker)).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: heading }),
      ).toBeInTheDocument();
      // Not repeated above the numbers, where it used to live.
      expect(screen.getAllByText(new RegExp(d.trafficRange))).toHaveLength(1);
    },
  );

  it("links to the reports on the same seven days", async () => {
    respondWith(LIVE_SUMMARY);
    renderWithProviders(
      <DashboardTrafficCard dashboardUrl={UMAMI_URL} />,
      READER,
    );

    const more = await screen.findByRole("link", { name: d.trafficMoreAria });
    expect(more).toHaveAttribute("href", "/analytics?preset=7d");
    expect(more).toHaveTextContent(d.trafficMore);
    // The outbound Umami link is still there.
    expect(
      screen.getByRole("link", { name: d.trafficOpenLinkAria }),
    ).toHaveAttribute("href", UMAMI_URL);
  });

  it("offers no «Детальніше» without analytics:read", async () => {
    respondWith(LIVE_SUMMARY);
    renderWithProviders(<DashboardTrafficCard dashboardUrl={UMAMI_URL} />);

    expect(await screen.findByText("380")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: d.trafficMoreAria }),
    ).not.toBeInTheDocument();
  });
});
