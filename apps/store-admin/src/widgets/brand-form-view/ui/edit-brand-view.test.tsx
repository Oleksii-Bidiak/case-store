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
import { EditBrandView } from "./edit-brand-view";

// next/navigation is unavailable under jsdom — mock the router.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

const BRAND_ID = "3f2b8c1e-5a4d-4e7f-9b21-0c6d8e9fa123";

const brand = {
  id: BRAND_ID,
  name: "Apple",
  slug: "apple",
  logo: null,
  isActive: true,
  createdAt: "2026-06-01T09:00:00.000Z",
  updatedAt: "2026-06-01T09:00:00.000Z",
};

function stubBrand() {
  server.use(
    http.get(`*/api/brands/admin/${BRAND_ID}`, () =>
      HttpResponse.json({ data: brand }),
    ),
  );
}

/** jsdom ships no clipboard — install one the test controls. */
function withClipboard(writeText: jest.Mock): void {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: undefined,
    configurable: true,
  });
});

/** «Технічне: ID бренду» is folded by default (БР5) — unfold it. */
async function openTechnical() {
  const section = await screen.findByRole("region", {
    name: dict.brands.technicalTitle,
  });
  await userEvent.click(
    within(section).getByRole("button", { name: dict.canon.expand }),
  );
}

describe("EditBrandView — header and side panel (БР5, БР9)", () => {
  it("names the brand in the heading with its site status and a «← Бренди» link", async () => {
    stubBrand();
    renderWithProviders(<EditBrandView brandId={BRAND_ID} />, {
      auth: { permissions: [PERM.brandsWrite] },
    });

    expect(
      await screen.findByRole("heading", { name: "Apple" }),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.brands.statusActive)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.brands.back }),
    ).toHaveAttribute("href", "/brands");
  });

  it("shows the product count as a link into «Товари» and when it was changed", async () => {
    stubBrand();
    server.use(
      http.get("*/api/products/admin/list", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("brandId")).toBe(BRAND_ID);
        return HttpResponse.json({
          data: [],
          meta: { total: 29, page: 1, limit: 1, totalPages: 29 },
        });
      }),
    );
    renderWithProviders(<EditBrandView brandId={BRAND_ID} />, {
      auth: { permissions: [PERM.brandsWrite, PERM.productsRead] },
    });

    const link = await screen.findByRole("link", { name: /29/ });
    expect(link).toHaveAttribute("href", `/products?brandId=${BRAND_ID}`);
    expect(screen.getByText(dict.brands.asideUpdated)).toBeInTheDocument();
  });

  it("is a writable form for `brands:write` and view-only without it", async () => {
    stubBrand();
    const { unmount } = renderWithProviders(
      <EditBrandView brandId={BRAND_ID} />,
      { auth: { permissions: [PERM.brandsWrite] } },
    );
    expect(
      await screen.findByRole("textbox", { name: dict.brandForm.name }),
    ).toHaveValue("Apple");
    unmount();

    stubBrand();
    renderWithProviders(<EditBrandView brandId={BRAND_ID} />);
    expect(await screen.findByText(dict.common.viewOnly)).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: dict.brandForm.name }),
    ).not.toBeInTheDocument();
  });
});

describe("EditBrandView — brand id (TASK-831)", () => {
  it("shows the brand uuid as selectable text once the brand has loaded", async () => {
    stubBrand();
    renderWithProviders(<EditBrandView brandId={BRAND_ID} />);
    await openTechnical();

    const idText = await screen.findByText(BRAND_ID);
    expect(idText).toHaveClass("select-all");
    expect(idText).toHaveClass("font-mono");
    expect(screen.getByText(dict.brands.idLabel)).toBeInTheDocument();
    // The label names a group that holds the uuid — not the <code> itself,
    // whose implicit role cannot carry a name.
    expect(
      screen.getByRole("group", { name: dict.brands.idLabel }),
    ).toContainElement(idText);
    expect(idText).not.toHaveAttribute("aria-labelledby");
  });

  it("copies the uuid to the clipboard and confirms it", async () => {
    stubBrand();
    const writeText = jest.fn().mockResolvedValue(undefined);
    withClipboard(writeText);
    renderWithProviders(<EditBrandView brandId={BRAND_ID} />);
    await openTechnical();

    await userEvent.click(
      await screen.findByRole("button", { name: dict.brands.copyIdAria }),
    );

    expect(writeText).toHaveBeenCalledWith(BRAND_ID);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        dict.brands.copyIdDone,
      ),
    );
  });

  it("says so when the browser refuses the clipboard, keeping the id visible", async () => {
    stubBrand();
    renderWithProviders(<EditBrandView brandId={BRAND_ID} />);
    await openTechnical();

    await userEvent.click(
      await screen.findByRole("button", { name: dict.brands.copyIdAria }),
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        dict.brands.copyIdFailed,
      ),
    );
    expect(screen.getByText(BRAND_ID)).toBeInTheDocument();
  });

  it("renders no id row while the brand fails to load", async () => {
    server.use(
      http.get(`*/api/brands/admin/${BRAND_ID}`, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderWithProviders(<EditBrandView brandId={BRAND_ID} />);

    expect(
      await screen.findByText(dict.brands.loadOneError),
    ).toBeInTheDocument();
    expect(screen.queryByText(dict.brands.idLabel)).not.toBeInTheDocument();
  });
});
