import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { PERM } from "@/entities/permission";
import { DeviceModelCoverageView } from "./device-model-coverage-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));
jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const t = dict.deviceCoverage;
const ID = "m-pro";

const COVERAGE = {
  model: {
    id: ID,
    name: "iPhone 15 Pro",
    slug: "iphone-15-pro",
    series: "iPhone 15",
    brandName: "Apple",
    isActive: true,
  },
  siblings: [
    { id: "m-15", name: "iPhone 15" },
    { id: "m-max", name: "iPhone 15 Pro Max" },
  ],
  stats: { compatibleProducts: 128, inStockProducts: 117, holes: 1 },
  categories: [
    {
      id: "c-cases",
      name: "Чохли",
      slug: "cases",
      icon: "cases",
      counts: [
        { deviceModelId: ID, productCount: 44 },
        { deviceModelId: "m-15", productCount: 51 },
        { deviceModelId: "m-max", productCount: 38 },
      ],
    },
    {
      id: "c-camera",
      name: "Захист камери",
      slug: "camera",
      icon: null,
      counts: [
        { deviceModelId: ID, productCount: 0 },
        { deviceModelId: "m-15", productCount: 6 },
        { deviceModelId: "m-max", productCount: 4 },
      ],
    },
  ],
  suspects: [
    { id: "p-1", name: "Захист камери ESR для iPhone 15 Pro", slug: "esr" },
  ],
};

function stubCoverage(body: object = COVERAGE) {
  server.use(
    http.get(`*/api/admin/devices/models/${ID}/coverage`, () =>
      HttpResponse.json({ data: body }),
    ),
  );
}

describe("DeviceModelCoverageView (TASK-1955)", () => {
  it("renders the header, the three stats, the matrix with the hole in red and the hole card", async () => {
    stubCoverage();
    renderWithProviders(<DeviceModelCoverageView modelId={ID} />, {
      auth: { permissions: [PERM.devicesRead, PERM.productsRead] },
    });

    expect(
      await screen.findByRole("heading", { name: "iPhone 15 Pro" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Apple · ${t.subtitleSeries("iPhone 15")} · ${t.shown}`),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: t.hubLink("iPhone 15 Pro") }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/\/devices\/iphone-15-pro$/),
    );

    expect(screen.getByText(t.statCompatible)).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("117")).toBeInTheDocument();

    const table = screen.getByRole("table");
    // Columns: category · this model (short) · bar · siblings (short).
    const expected = [
      t.columnCategory,
      "15 Pro",
      t.columnShare,
      "15",
      "15 Pro Max",
    ];
    const headers = within(table).getAllByRole("columnheader");
    expect(headers).toHaveLength(expected.length);
    headers.forEach((th, index) =>
      expect(th).toHaveAccessibleName(expected[index]),
    );
    // TASK-1978: a sibling's short name opens its full name on tap too.
    expect(
      within(headers[4]).getByRole("button", { name: "15 Pro Max" }),
    ).toHaveAccessibleDescription("iPhone 15 Pro Max");
    const holeRow = within(table).getByRole("row", { name: /Захист камери/ });
    expect(within(holeRow).getAllByRole("cell")[1]).toHaveClass(
      "text-destructive",
    );

    expect(screen.getByText(t.holeTitle("Захист камери"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.holeAction })).toHaveAttribute(
      "href",
      "/products?categoryId=c-camera&deviceModelId=m-15",
    );
    // Read-only: the suspect is listed, without «Додати».
    expect(
      screen.getByText("Захист камери ESR для iPhone 15 Pro"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Додати iPhone 15 Pro/ }),
    ).toBeNull();
  });

  it("adds the model to a suspect in one click with devices:write", async () => {
    stubCoverage();
    const bodies: unknown[] = [];
    server.use(
      http.put("*/api/admin/devices/compat/bulk", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({
          data: { updatedProducts: 1, added: 1, removed: 0 },
        });
      }),
    );
    renderWithProviders(<DeviceModelCoverageView modelId={ID} />, {
      auth: { permissions: [PERM.devicesWrite] },
    });

    await userEvent.click(
      await screen.findByRole("button", {
        name: t.suspectAddAria(
          "iPhone 15 Pro",
          "Захист камери ESR для iPhone 15 Pro",
        ),
      }),
    );

    await waitFor(() =>
      expect(bodies).toEqual([
        { productIds: ["p-1"], mode: "add", deviceModelIds: [ID] },
      ]),
    );
  });

  it("says there is nothing to compare with for a model without siblings", async () => {
    stubCoverage({
      ...COVERAGE,
      model: { ...COVERAGE.model, series: null, isActive: false },
      siblings: [],
      stats: { compatibleProducts: 0, inStockProducts: 0, holes: 0 },
      categories: [],
      suspects: [],
    });
    renderWithProviders(<DeviceModelCoverageView modelId={ID} />, {
      auth: { permissions: [PERM.devicesRead] },
    });

    expect(await screen.findByText(t.matrixLeadAlone)).toBeInTheDocument();
    expect(screen.getByText(t.matrixEmpty)).toBeInTheDocument();
    expect(screen.getByText(`Apple · ${t.hidden}`)).toBeInTheDocument();
    // Hidden models are not linked to the storefront.
    expect(screen.queryByRole("link", { name: /на сайті/ })).toBeNull();
    expect(screen.queryByText(t.suspectsTitle)).toBeNull();
  });
});
