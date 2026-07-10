import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { DashboardTrafficCard } from "./DashboardTrafficCard";

const d = dict.dashboard;

const UMAMI_URL = "https://analytics.mystore.ua/websites/site-1";

describe("DashboardTrafficCard — configured (TASK-262)", () => {
  it("renders an outbound link to the Umami dashboard, new tab", () => {
    renderWithProviders(<DashboardTrafficCard dashboardUrl={UMAMI_URL} />);

    expect(screen.getByText(d.trafficHeading)).toBeInTheDocument();
    expect(screen.getByText(d.trafficSubtext)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: d.trafficOpenLink });
    expect(link).toHaveAttribute("href", UMAMI_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    expect(screen.queryByText(d.trafficNotConfigured)).not.toBeInTheDocument();
  });
});

describe("DashboardTrafficCard — not configured (TASK-262)", () => {
  it.each([
    ["prop omitted (env constant empty in tests)", undefined],
    ["explicit empty string", ""],
  ])("renders the muted copy and no link — %s", (_label, url) => {
    renderWithProviders(<DashboardTrafficCard dashboardUrl={url} />);

    expect(screen.getByText(d.trafficHeading)).toBeInTheDocument();
    expect(screen.getByText(d.trafficNotConfigured)).toBeInTheDocument();
    // No dead href="" link in the unconfigured state.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
