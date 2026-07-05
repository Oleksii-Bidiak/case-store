import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ModelPicker } from "./model-picker";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

const brands = [
  {
    id: "brand-apple",
    name: "Apple",
    slug: "apple",
    isActive: true,
    sortOrder: 0,
  },
];

const models = [
  {
    id: "model-15pro",
    deviceBrandId: "brand-apple",
    name: "iPhone 15 Pro",
    slug: "iphone-15-pro",
    series: "iPhone 15",
    releaseYear: 2023,
    isActive: true,
    brandName: "Apple",
  },
];

beforeEach(() => {
  mockPush.mockClear();
  server.use(
    http.get("http://localhost:3001/api/device-brands", () =>
      HttpResponse.json({ data: brands }),
    ),
    http.get("http://localhost:3001/api/device-models", ({ request }) => {
      const url = new URL(request.url);
      const brandId = url.searchParams.get("deviceBrandId");
      const data = brandId === "brand-apple" ? models : [];
      return HttpResponse.json({ data });
    }),
  );
});

describe("ModelPicker (TASK-190)", () => {
  it("cascades brand → model and navigates to the filtered catalog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ModelPicker />);

    // Brand select populated from the API.
    const brandTrigger = await screen.findByLabelText(
      dict.home.modelPicker.brandAria,
    );
    await user.click(brandTrigger);
    await user.click(await screen.findByRole("option", { name: "Apple" }));

    // Model select becomes enabled and scoped to the chosen brand.
    const modelTrigger = screen.getByLabelText(dict.home.modelPicker.modelAria);
    await waitFor(() => expect(modelTrigger).not.toBeDisabled());
    await user.click(modelTrigger);
    await user.click(
      await screen.findByRole("option", { name: "iPhone 15 Pro" }),
    );

    await user.click(
      screen.getByRole("button", { name: dict.home.modelPicker.submit }),
    );

    expect(mockPush).toHaveBeenCalledWith(
      "/products?deviceModelId=model-15pro",
    );
  });
});
