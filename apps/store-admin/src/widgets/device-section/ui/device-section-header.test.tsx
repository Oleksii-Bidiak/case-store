import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { PERM } from "@/entities/permission";
import { DeviceSectionHeader } from "./device-section-header";

const d = dict.devices;

function stubCounts() {
  server.use(
    http.get("*/api/admin/devices/brands", () =>
      HttpResponse.json({
        data: [
          {
            id: "a",
            name: "Apple",
            slug: "apple",
            isActive: true,
            sortOrder: 0,
          },
          {
            id: "b",
            name: "Samsung",
            slug: "samsung",
            isActive: true,
            sortOrder: 1,
          },
          {
            id: "c",
            name: "Xiaomi",
            slug: "xiaomi",
            isActive: true,
            sortOrder: 2,
          },
        ],
      }),
    ),
    http.get("*/api/admin/devices/models", () =>
      HttpResponse.json({
        data: [],
        meta: { total: 40, page: 1, limit: 1, totalPages: 40 },
      }),
    ),
  );
}

describe("DeviceSectionHeader (ПР1, ПР5)", () => {
  it("is one section «Пристрої» with real page tabs and their counts", async () => {
    stubCounts();
    renderWithProviders(<DeviceSectionHeader active="models" />);

    expect(
      screen.getByRole("heading", { name: dict.nav.devices }),
    ).toBeInTheDocument();
    expect(screen.getByText(d.sectionDescription)).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: d.sectionTabsAria });
    const brands = screen.getByRole("link", { name: new RegExp(d.tabBrands) });
    const models = screen.getByRole("link", { name: new RegExp(d.tabModels) });
    expect(nav).toContainElement(brands);
    expect(brands).toHaveAttribute("href", "/devices/brands");
    expect(models).toHaveAttribute("href", "/devices/models");
    expect(models).toHaveAttribute("aria-current", "page");
    expect(brands).not.toHaveAttribute("aria-current");
    await waitFor(() => expect(brands).toHaveTextContent("3"));
    await waitFor(() => expect(models).toHaveTextContent("40"));
  });

  it("offers the tab's own «Додати…» only to `devices:write`", () => {
    stubCounts();
    const { unmount } = renderWithProviders(
      <DeviceSectionHeader active="brands" />,
      { auth: { permissions: [PERM.devicesWrite] } },
    );
    expect(screen.getByRole("link", { name: d.addBrand })).toHaveAttribute(
      "href",
      "/devices/brands/new",
    );
    unmount();

    renderWithProviders(<DeviceSectionHeader active="models" />, {
      auth: { permissions: [PERM.devicesWrite] },
    });
    expect(screen.getByRole("link", { name: d.addModel })).toHaveAttribute(
      "href",
      "/devices/models/new",
    );
  });

  it("has no «Додати…» for a view-only session", () => {
    stubCounts();
    renderWithProviders(<DeviceSectionHeader active="models" />);
    expect(
      screen.queryByRole("link", { name: d.addModel }),
    ).not.toBeInTheDocument();
  });
});
