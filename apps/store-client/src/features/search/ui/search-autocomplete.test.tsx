import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { SearchAutocomplete } from "./search-autocomplete";

// next/navigation is unavailable under jsdom — mock the router.
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

function suggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: "product-1",
    name: "iPhone 15 Case",
    slug: "iphone-15-case",
    price: "29.99",
    compareAtPrice: null,
    primaryImageUrl: null,
    ...overrides,
  };
}

/** Register a suggest handler returning the given rows for any query. */
function mockSuggest(rows: ReturnType<typeof suggestion>[]) {
  server.use(
    http.get("*/api/search/suggest", () => HttpResponse.json({ data: rows })),
  );
}

describe("SearchAutocomplete", () => {
  beforeEach(() => mockPush.mockClear());

  it("renders an accessible search combobox", () => {
    renderWithProviders(<SearchAutocomplete />);
    expect(
      screen.getByRole("combobox", { name: dict.search.inputAria }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.search.submitAria }),
    ).toBeInTheDocument();
  });

  it("fetches and shows suggestions as the user types", async () => {
    mockSuggest([
      suggestion(),
      suggestion({
        id: "p2",
        name: "Screen Protector",
        slug: "screen-protector",
      }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<SearchAutocomplete />);

    await user.type(screen.getByRole("combobox"), "айф");

    expect(await screen.findByText("iPhone 15 Case")).toBeInTheDocument();
    expect(screen.getByText("Screen Protector")).toBeInTheDocument();
  });

  it("navigates to the product PDP when a suggestion is picked", async () => {
    mockSuggest([suggestion()]);
    const user = userEvent.setup();
    renderWithProviders(<SearchAutocomplete />);

    await user.type(screen.getByRole("combobox"), "айф");
    await user.click(await screen.findByText("iPhone 15 Case"));

    expect(mockPush).toHaveBeenCalledWith("/products/iphone-15-case");
  });

  it("selects the highlighted suggestion with ArrowDown + Enter (keyboard)", async () => {
    mockSuggest([suggestion()]);
    const user = userEvent.setup();
    renderWithProviders(<SearchAutocomplete />);

    const input = screen.getByRole("combobox");
    await user.type(input, "айф");
    await screen.findByText("iPhone 15 Case");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(mockPush).toHaveBeenCalledWith("/products/iphone-15-case");
  });

  it("submits to /search on Enter when nothing is highlighted", async () => {
    mockSuggest([]);
    const user = userEvent.setup();
    renderWithProviders(<SearchAutocomplete />);

    await user.type(screen.getByRole("combobox"), "чохол{Enter}");

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        `/search?q=${encodeURIComponent("чохол")}`,
      ),
    );
  });

  it("does not navigate on submit when the query is blank", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchAutocomplete />);

    await user.click(
      screen.getByRole("button", { name: dict.search.submitAria }),
    );

    expect(mockPush).not.toHaveBeenCalled();
  });
});
