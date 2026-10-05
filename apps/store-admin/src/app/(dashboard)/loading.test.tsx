import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import Loading from "./loading";

/**
 * TASK-1037 (П3, canon 1.7): the route's loading UI keeps the page heading and
 * draws skeletons in the layout the page will actually have for this session —
 * the old one drew four stat cards for a page of ten, six needs-action cards for
 * nine, and no heading at all, so everything jumped when the data landed.
 */
const OWNER = [
  "analytics:read",
  "analytics:revenue",
  "orders:read",
  "returns:read",
  "products:write",
  "customers:read",
];

function count(container: HTMLElement, slot: string): number {
  return container.querySelectorAll(`[data-slot='${slot}']`).length;
}

describe("dashboard loading.tsx (TASK-1037)", () => {
  it("keeps the «Огляд» heading", () => {
    renderWithProviders(<Loading />, { auth: { permissions: OWNER } });

    expect(
      screen.getByRole("heading", { level: 2, name: dict.dashboard.heading }),
    ).toBeInTheDocument();
  });

  it("draws the owner's layout: nine needs-action cards, ten stat cards, two charts", () => {
    const { container } = renderWithProviders(<Loading />, {
      auth: { permissions: OWNER },
    });

    expect(count(container, "needs-action-skeleton")).toBe(9);
    expect(count(container, "stat-skeleton")).toBe(10);
    expect(count(container, "chart-skeleton")).toBe(2);
  });

  it("draws the layout without money for a manager without analytics:revenue", () => {
    const { container } = renderWithProviders(<Loading />, {
      auth: { permissions: ["analytics:read", "orders:read"] },
    });

    expect(count(container, "needs-action-skeleton")).toBe(8);
    expect(count(container, "stat-skeleton")).toBe(5);
    expect(count(container, "chart-skeleton")).toBe(1);
  });

  it("draws no analytics skeletons for a session that will not see analytics", () => {
    const { container } = renderWithProviders(<Loading />, {
      auth: { permissions: [] },
    });

    expect(
      screen.getByRole("heading", { level: 2, name: dict.dashboard.heading }),
    ).toBeInTheDocument();
    expect(count(container, "needs-action-skeleton")).toBe(0);
    expect(count(container, "stat-skeleton")).toBe(0);
  });
});
