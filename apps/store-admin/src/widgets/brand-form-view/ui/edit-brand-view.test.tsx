import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
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

describe("EditBrandView — brand id (TASK-831)", () => {
  it("shows the brand uuid as selectable text once the brand has loaded", async () => {
    stubBrand();
    renderWithProviders(<EditBrandView brandId={BRAND_ID} />);

    const idText = await screen.findByText(BRAND_ID);
    expect(idText).toHaveClass("select-all");
    expect(idText).toHaveClass("font-mono");
    expect(screen.getByText(dict.brands.idLabel)).toBeInTheDocument();
  });

  it("copies the uuid to the clipboard and confirms it", async () => {
    stubBrand();
    const writeText = jest.fn().mockResolvedValue(undefined);
    withClipboard(writeText);
    renderWithProviders(<EditBrandView brandId={BRAND_ID} />);

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
