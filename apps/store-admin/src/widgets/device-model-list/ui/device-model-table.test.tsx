/**
 * `DeviceModelTable` — TASK-357.
 *
 * This table was already paginated and searchable; what it lacked was any way to
 * force a refetch (admin queries sit behind a five-minute `staleTime`), and its
 * search box borrowed the section heading as both placeholder and label, so a
 * screen reader announced a field named after the page it sits on.
 */

import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { DeviceModelTable } from "./device-model-table";

const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  usePathname: () => "/devices",
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockPush.mockClear();
  mockSearchParams = new URLSearchParams("");
});

function makeModelRow(id: string, name: string) {
  return {
    id,
    brandId: "brand-1",
    brandName: "Apple",
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    series: "iPhone",
    releaseYear: 2024,
    sortOrder: 0,
    isActive: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

function stubModels(
  rows: ReturnType<typeof makeModelRow>[],
  meta?: { total: number; page: number; limit: number; totalPages: number },
) {
  const requests: URL[] = [];
  server.use(
    http.get("*/api/admin/devices/models", ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({
        data: rows,
        meta: meta ?? { total: rows.length, page: 1, limit: 20, totalPages: 1 },
      });
    }),
  );
  return requests;
}

describe("DeviceModelTable — toolbar (TASK-357)", () => {
  it("refetches on demand — the point of the refresh control", async () => {
    const requests = stubModels([makeModelRow("m1", "iPhone 16 Pro")]);

    renderWithProviders(<DeviceModelTable />);
    await screen.findByText("iPhone 16 Pro");
    expect(requests).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.table.refreshAria }),
    );

    await waitFor(() => expect(requests).toHaveLength(2));
  });

  it("labels the search box as a search, not as the page heading", async () => {
    stubModels([makeModelRow("m1", "iPhone 16 Pro")]);

    renderWithProviders(<DeviceModelTable />);
    await screen.findByText("iPhone 16 Pro");

    expect(
      screen.getByLabelText(dict.devices.modelsSearchAria),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(dict.devices.modelsHeading),
    ).not.toBeInTheDocument();
  });

  // An empty page under an active search must not read as "no models yet".
  it("distinguishes an empty search result from an empty table", async () => {
    mockSearchParams = new URLSearchParams("search=невідоме");
    stubModels([]);

    renderWithProviders(<DeviceModelTable />);

    expect(
      await screen.findByText(dict.devices.modelsEmptyMatch("невідоме")),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.devices.modelsEmpty),
    ).not.toBeInTheDocument();
  });
});
