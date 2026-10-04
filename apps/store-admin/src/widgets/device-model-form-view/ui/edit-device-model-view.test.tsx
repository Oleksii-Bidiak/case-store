/**
 * `EditDeviceModelView` — the compat-landing SEO block (TASK-490), widget-level
 * (TASK-713, AD-DEV-11 / TASK-841).
 *
 * The schema test already pins `deviceModelValuesToDto`. What only a widget test
 * can pin is the ROUND TRIP an operator performs: a model loads with a custom
 * SEO title, they empty the field and save, and the storefront goes back to the
 * generated text. That needs three things to line up — the server value seeds
 * the input, an emptied input goes out as `null` (the API's «use the template»;
 * `""` or an omitted key would leave the override in place), and a model whose
 * override is `null` loads as an EMPTY field showing the «automatic» hint rather
 * than the string "null".
 */

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
import { CreateDeviceModelView } from "./create-device-model-view";
import { EditDeviceModelView } from "./edit-device-model-view";

const WRITER = { permissions: [PERM.devicesWrite, PERM.productsRead] };

const mockPush = jest.fn();
// next/navigation is unavailable under jsdom — mock the router.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush }),
}));

const MODEL_ID = "7b0e3c2a-1f4d-4c8e-9a6b-2d5f8e1c4a90";
const BRAND_ID = "3f2b8c1e-5a4d-4e7f-9b21-0c6d8e9fa123";

const t = dict.deviceModelForm;

function makeModel(overrides: Record<string, unknown> = {}) {
  return {
    id: MODEL_ID,
    deviceBrandId: BRAND_ID,
    name: "iPhone 15 Pro",
    slug: "iphone-15-pro",
    series: "iPhone 15",
    releaseYear: 2023,
    isActive: true,
    metaTitle: "Чохли для iPhone 15 Pro — з гарантією",
    metaDescription: "Власний опис для пошуку",
    description: "Власний абзац",
    brandName: "Apple",
    ...overrides,
  };
}

/** Serve the model + brand list; record every update body (the API updates with PUT). */
function stubModel(model = makeModel()) {
  const updates: Array<Record<string, unknown>> = [];
  server.use(
    http.get(`*/api/admin/devices/models/${MODEL_ID}`, () =>
      HttpResponse.json({ data: model }),
    ),
    http.get("*/api/admin/devices/brands", () =>
      HttpResponse.json({
        data: [
          {
            id: BRAND_ID,
            name: "Apple",
            slug: "apple",
            isActive: true,
            sortOrder: 0,
          },
        ],
        meta: { total: 1, page: 1, limit: 1, totalPages: 1 },
      }),
    ),
    http.get("*/api/admin/devices/models", () =>
      HttpResponse.json({
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      }),
    ),
    http.get("*/api/catalog/compat-pages", () =>
      HttpResponse.json({
        data: [
          {
            categoryId: "c1",
            categorySlug: "chokhly",
            categoryName: "Чохли",
            deviceModelId: MODEL_ID,
            deviceSlug: "iphone-15-pro",
            deviceName: "iPhone 15 Pro",
            productCount: 18,
          },
          {
            categoryId: "c2",
            categorySlug: "sklo",
            categoryName: "Захисне скло",
            deviceModelId: "other-model",
            deviceSlug: "galaxy-s24",
            deviceName: "Galaxy S24",
            productCount: 4,
          },
        ],
        meta: { total: 2 },
      }),
    ),
    http.get("*/api/products/admin/list", () =>
      HttpResponse.json({
        data: [],
        meta: { total: 34, page: 1, limit: 1, totalPages: 34 },
      }),
    ),
    http.put(`*/api/admin/devices/models/${MODEL_ID}`, async ({ request }) => {
      updates.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({ data: { ...model, metaTitle: null } });
    }),
  );
  return updates;
}

beforeEach(() => mockPush.mockClear());

describe("EditDeviceModelView — SEO block (TASK-713 / TASK-841)", () => {
  it("seeds the three SEO fields from the loaded model", async () => {
    stubModel();
    renderWithProviders(<EditDeviceModelView modelId={MODEL_ID} />, {
      auth: WRITER,
    });

    expect(await screen.findByLabelText(t.metaTitle)).toHaveValue(
      "Чохли для iPhone 15 Pro — з гарантією",
    );
    expect(screen.getByLabelText(t.metaDescription)).toHaveValue(
      "Власний опис для пошуку",
    );
    expect(screen.getByLabelText(t.description)).toHaveValue("Власний абзац");
    // The block says what an empty field means before anyone empties one.
    expect(
      screen.getByRole("region", { name: t.seoHeading }),
    ).toHaveTextContent(t.seoHint);
  });

  it("clearing the title sends metaTitle: null — and only the cleared field goes back to automatic", async () => {
    const updates = stubModel();
    renderWithProviders(<EditDeviceModelView modelId={MODEL_ID} />, {
      auth: WRITER,
    });

    const title = await screen.findByLabelText(t.metaTitle);
    await waitFor(() =>
      expect(title).toHaveValue("Чохли для iPhone 15 Pro — з гарантією"),
    );
    await userEvent.clear(title);

    // The automatic text is what the empty field now promises.
    expect(title).toHaveValue("");
    expect(title).toHaveAttribute("placeholder", t.metaTitlePlaceholder);

    await userEvent.click(screen.getByRole("button", { name: t.submit }));

    await waitFor(() => expect(updates).toHaveLength(1));
    // `null`, not "" and not an omitted key: only `null` makes the API drop the
    // override so the storefront falls back to the generated title.
    expect(updates[0]).toHaveProperty("metaTitle", null);
    // The untouched overrides are sent as they are, not wiped along with it.
    expect(updates[0]).toMatchObject({
      metaDescription: "Власний опис для пошуку",
      description: "Власний абзац",
    });
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/devices/models"),
    );
  });

  it("a whitespace-only title counts as cleared too", async () => {
    const updates = stubModel();
    renderWithProviders(<EditDeviceModelView modelId={MODEL_ID} />, {
      auth: WRITER,
    });

    const title = await screen.findByLabelText(t.metaTitle);
    await waitFor(() => expect(title).not.toHaveValue(""));
    await userEvent.clear(title);
    await userEvent.type(title, "   ");
    await userEvent.click(screen.getByRole("button", { name: t.submit }));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toHaveProperty("metaTitle", null);
  });

  it("reopened after the reset, the model shows an empty field with the automatic hint — not «null»", async () => {
    stubModel(
      makeModel({ metaTitle: null, metaDescription: null, description: null }),
    );
    renderWithProviders(<EditDeviceModelView modelId={MODEL_ID} />, {
      auth: WRITER,
    });

    const title = await screen.findByLabelText(t.metaTitle);
    expect(title).toHaveValue("");
    expect(title).toHaveAttribute("placeholder", t.metaTitlePlaceholder);
    expect(screen.getByLabelText(t.metaDescription)).toHaveValue("");
    expect(screen.getByLabelText(t.description)).toHaveValue("");
    expect(screen.queryByDisplayValue("null")).toBeNull();
  });
});

describe("EditDeviceModelView — canon layout (ПР7, ПР11)", () => {
  it("names the model in the heading with its status and «← Пристрої · Моделі»", async () => {
    stubModel();
    renderWithProviders(<EditDeviceModelView modelId={MODEL_ID} />, {
      auth: WRITER,
    });

    expect(
      await screen.findByRole("heading", { name: "iPhone 15 Pro" }),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.devices.statusActive)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.devices.backToModels }),
    ).toHaveAttribute("href", "/devices/models");
  });

  it("groups the fields into sections, with the brand as a searchable combobox", async () => {
    stubModel();
    renderWithProviders(<EditDeviceModelView modelId={MODEL_ID} />, {
      auth: WRITER,
    });

    const main = await screen.findByRole("region", { name: t.sectionMain });
    expect(
      within(main).getByRole("combobox", { name: t.brand }),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: t.active })).toBeChecked();
  });

  it("lists only THIS model's live compatibility pages, each linking to the site", async () => {
    stubModel();
    renderWithProviders(<EditDeviceModelView modelId={MODEL_ID} />, {
      auth: WRITER,
    });

    const list = await screen.findByRole("list", { name: t.pagesListAria });
    const links = within(list).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(
      t.pageOpenAria(t.pageTitle("Чохли", "iPhone 15 Pro")),
    );
    expect(links[0]).toHaveTextContent(t.pageProducts(18));
    expect(links[0].getAttribute("href")).toMatch(
      /\/catalog\/chokhly\/iphone-15-pro$/,
    );
  });

  it("shows the compatible products as a link into «Товари» in the side panel", async () => {
    stubModel();
    renderWithProviders(<EditDeviceModelView modelId={MODEL_ID} />, {
      auth: WRITER,
    });

    const link = await screen.findByRole("link", { name: /34/ });
    expect(link).toHaveAttribute("href", `/products?deviceModelId=${MODEL_ID}`);
    expect(
      screen.getByText(dict.devices.asideCompatProducts),
    ).toBeInTheDocument();
  });

  it("view-only without `devices:write`: the values as text, no save", async () => {
    stubModel();
    renderWithProviders(<EditDeviceModelView modelId={MODEL_ID} />);

    expect(await screen.findByText(dict.common.viewOnly)).toBeInTheDocument();
    expect(await screen.findByText("Власний абзац")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: t.submit }),
    ).not.toBeInTheDocument();
  });

  it("an empty submit of a new model shows the errors under the fields", async () => {
    stubModel();
    renderWithProviders(<CreateDeviceModelView />, { auth: WRITER });

    await userEvent.click(
      await screen.findByRole("button", { name: t.createSubmit }),
    );

    expect(await screen.findByText(t.errorSummary(2))).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: t.name })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText(t.errors.brandRequired)).toBeInTheDocument();
  });
});
